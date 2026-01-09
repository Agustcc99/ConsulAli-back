import { Tratamiento } from "../models/Tratamiento.js";
import { Pago } from "../models/Pago.js";
import { Gasto } from "../models/Gasto.js";
import { calcularDistribucionFija } from "../services/finanzas.service.js";
import { responderBadRequest, responderServerError } from "../utils/respuestas.js";

function obtenerRangoMensual(anio, mes) {
  // mes: 1..12
  const inicioMes = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
  const finMesExclusivo = new Date(anio, mes, 1, 0, 0, 0, 0); // primer día del mes siguiente
  return { inicioMes, finMesExclusivo };
}

function obtenerRangoDiario(fechaStr) {
  // fechaStr esperado: "YYYY-MM-DD"
  let inicioDia;

  if (fechaStr === undefined || fechaStr === null || fechaStr === "") {
    const ahora = new Date();
    inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaStr))) return null;
    const [anio, mes, dia] = String(fechaStr).split("-").map(Number);
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
    inicioDia = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
  }

  const finDiaExclusivo = new Date(inicioDia);
  finDiaExclusivo.setDate(finDiaExclusivo.getDate() + 1);

  const fechaISO = `${inicioDia.getFullYear()}-${String(inicioDia.getMonth() + 1).padStart(2, "0")}-${String(
    inicioDia.getDate()
  ).padStart(2, "0")}`;

  return { fechaISO, inicioDia, finDiaExclusivo };
}

function estaEnRango(fecha, inicio, finExclusivo) {
  const d = new Date(fecha);
  return d >= inicio && d < finExclusivo;
}

/**
 * Reparte pagos en waterfall según objetivos finales:
 * 1) lab
 * 2) mamá
 * 3) Alicia
 *
 * Devuelve Map(pagoId -> { paraLab, paraMama, paraAlicia, excedente })
 */
function construirAsignacionPorPago(pagosOrdenados, objetivo) {
  const objetivoLab = Number(objetivo?.lab ?? 0);
  const objetivoMama = Number(objetivo?.mama ?? 0);
  const objetivoAlicia = Number(objetivo?.alicia ?? 0);

  let cubiertoLab = 0;
  let cubiertoMama = 0;
  let cubiertoAlicia = 0;

  const mapa = new Map();

  for (const pago of pagosOrdenados) {
    const idPago = String(pago._id);
    let resto = Number(pago?.monto ?? 0);

    const faltaLab = Math.max(objetivoLab - cubiertoLab, 0);
    const paraLab = Math.min(resto, faltaLab);
    resto -= paraLab;

    const faltaMama = Math.max(objetivoMama - cubiertoMama, 0);
    const paraMama = Math.min(resto, faltaMama);
    resto -= paraMama;

    const faltaAlicia = Math.max(objetivoAlicia - cubiertoAlicia, 0);
    const paraAlicia = Math.min(resto, faltaAlicia);
    resto -= paraAlicia;

    cubiertoLab += paraLab;
    cubiertoMama += paraMama;
    cubiertoAlicia += paraAlicia;

    const excedente = Math.max(resto, 0);

    mapa.set(idPago, { paraLab, paraMama, paraAlicia, excedente });
  }

  return mapa;
}

/**
 * Reporte mensual
 * - Totales del mes por fecha de pago/gasto (cashflow)
 * - Foto de saldos al cierre del mes (sumando t0do lo ocurrido hasta fin del mes)
 * - NUEVO: distribución del mes (waterfall) SOLO con pagos dentro del mes
 */
export const obtenerReporteMensual = async (req, res) => {
  try {
    const anio = Number(req.query.anio);
    const mes = Number(req.query.mes);

    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return responderBadRequest(res, "Parámetros inválidos. Use ?anio=YYYY&mes=1..12");
    }

    const { inicioMes, finMesExclusivo } = obtenerRangoMensual(anio, mes);

    // 1) Cashflow del mes (por fecha)
    const [pagosDelMes, gastosDelMes] = await Promise.all([
      Pago.find({ fecha: { $gte: inicioMes, $lt: finMesExclusivo } }),
      Gasto.find({ fecha: { $gte: inicioMes, $lt: finMesExclusivo } }),
    ]);

    const totalCobradoPacientesMes = pagosDelMes.reduce((acc, p) => acc + (p.monto || 0), 0);
    const totalGastosMes = gastosDelMes.reduce((acc, g) => acc + (g.monto || 0), 0);
    const totalPagadoLaboratorioMes = gastosDelMes
      .filter((g) => g.tipo === "laboratorio")
      .reduce((acc, g) => acc + (g.monto || 0), 0);

    // 2) Foto de saldos al cierre del mes:
    const tratamientosHastaCierre = await Tratamiento.find({
      fechaInicio: { $lt: finMesExclusivo },
    }).populate("pacienteId");

    const idsTratamientos = tratamientosHastaCierre.map((t) => t._id);

    const [pagosHastaCierre, gastosHastaCierre] = await Promise.all([
      Pago.find({ tratamientoId: { $in: idsTratamientos }, fecha: { $lt: finMesExclusivo } }),
      Gasto.find({ tratamientoId: { $in: idsTratamientos }, fecha: { $lt: finMesExclusivo } }),
    ]);

    const pagosPorTratamiento = new Map();
    for (const pago of pagosHastaCierre) {
      const clave = String(pago.tratamientoId);
      if (!pagosPorTratamiento.has(clave)) pagosPorTratamiento.set(clave, []);
      pagosPorTratamiento.get(clave).push(pago);
    }

    const gastosPorTratamiento = new Map();
    for (const gasto of gastosHastaCierre) {
      const clave = String(gasto.tratamientoId);
      if (!gastosPorTratamiento.has(clave)) gastosPorTratamiento.set(clave, []);
      gastosPorTratamiento.get(clave).push(gasto);
    }

    let totalCorrespondienteMama = 0;
    let totalCobradoMama = 0;
    let totalPendienteMama = 0;

    let totalCorrespondienteAlicia = 0;
    let totalCobradoAlicia = 0;
    let totalPendienteAlicia = 0;

    let saldoPendienteTotalPacientes = 0;

    // ✅ NUEVO: distribución del mes (waterfall) SOLO con pagos dentro del mes
    let cobradoLabMes = 0;
    let cobradoMamaMes = 0;
    let cobradoAliciaMes = 0;
    let excedenteMes = 0;

    for (const tratamiento of tratamientosHastaCierre) {
      const idTrat = String(tratamiento._id);
      const pagosT = (pagosPorTratamiento.get(idTrat) || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const gastosT = (gastosPorTratamiento.get(idTrat) || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

      const resumen = calcularDistribucionFija(tratamiento.toObject(), gastosT, pagosT);

      // --- Foto cierre (acumulada al cierre del mes)
      totalCorrespondienteMama += resumen.objetivo.mama;
      totalCobradoMama += resumen.pagado.mama;
      totalPendienteMama += resumen.saldo.mama;

      totalCorrespondienteAlicia += resumen.objetivo.alicia;
      totalCobradoAlicia += resumen.pagado.alicia;
      totalPendienteAlicia += resumen.saldo.alicia;

      saldoPendienteTotalPacientes += resumen.saldo.paciente;

      // --- ✅ Distribución DEL MES (solo pagos dentro del mes)
      const asignacionPorPago = construirAsignacionPorPago(pagosT, resumen.objetivo);

      for (const p of pagosT) {
        if (!estaEnRango(p.fecha, inicioMes, finMesExclusivo)) continue;

        const asg = asignacionPorPago.get(String(p._id));
        if (!asg) continue;

        cobradoLabMes += asg.paraLab || 0;
        cobradoMamaMes += asg.paraMama || 0;
        cobradoAliciaMes += asg.paraAlicia || 0;
        excedenteMes += asg.excedente || 0;
      }
    }

    return res.json({
      periodo: {
        anio,
        mes,
        desde: inicioMes,
        hastaExclusivo: finMesExclusivo,
      },
      cashflowDelMes: {
        totalCobradoPacientesMes,
        totalPagadoLaboratorioMes,
        totalGastosMes,
        cantidadPagosMes: pagosDelMes.length,
        cantidadGastosMes: gastosDelMes.length,
      },

      // ✅ NUEVO: lo cobrado DEL MES según waterfall (no acumulado)
      distribucionDelMes: {
        paraLaboratorio: cobradoLabMes,
        paraMama: cobradoMamaMes,
        paraAlicia: cobradoAliciaMes,
        excedente: excedenteMes,
      },

      fotoCierreMes: {
        totalCorrespondienteMama,
        totalCobradoMama,
        totalPendienteMama,

        totalCorrespondienteAlicia,
        totalCobradoAlicia,
        totalPendienteAlicia,

        saldoPendienteTotalPacientes,
        cantidadTratamientosConsiderados: tratamientosHastaCierre.length,
      },
    });
  } catch (error) {
    return responderServerError(res, "Error al generar reporte mensual", error);
  }
};

/**
 * Pendientes (foto al cierre del mes):
 * - pendientesMama: tratamientos donde todavía falta cubrir lo de mamá
 * - pendientesAlicia: tratamientos donde mamá ya está cubierta pero falta Alicia
 */
export const obtenerPendientesMamaYAlicia = async (req, res) => {
  try {
    const anio = Number(req.query.anio);
    const mes = Number(req.query.mes);

    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return responderBadRequest(res, "Parámetros inválidos. Use ?anio=YYYY&mes=1..12");
    }

    const { finMesExclusivo } = obtenerRangoMensual(anio, mes);

    const tratamientosHastaCierre = await Tratamiento.find({
      fechaInicio: { $lt: finMesExclusivo },
    }).populate("pacienteId");

    const idsTratamientos = tratamientosHastaCierre.map((t) => t._id);

    const [pagosHastaCierre, gastosHastaCierre] = await Promise.all([
      Pago.find({ tratamientoId: { $in: idsTratamientos }, fecha: { $lt: finMesExclusivo } }),
      Gasto.find({ tratamientoId: { $in: idsTratamientos }, fecha: { $lt: finMesExclusivo } }),
    ]);

    const pagosPorTratamiento = new Map();
    for (const pago of pagosHastaCierre) {
      const clave = String(pago.tratamientoId);
      if (!pagosPorTratamiento.has(clave)) pagosPorTratamiento.set(clave, []);
      pagosPorTratamiento.get(clave).push(pago);
    }

    const gastosPorTratamiento = new Map();
    for (const gasto of gastosHastaCierre) {
      const clave = String(gasto.tratamientoId);
      if (!gastosPorTratamiento.has(clave)) gastosPorTratamiento.set(clave, []);
      gastosPorTratamiento.get(clave).push(gasto);
    }

    const pendientesMama = [];
    const pendientesAlicia = [];

    for (const tratamiento of tratamientosHastaCierre) {
      const idTrat = String(tratamiento._id);

      const pagosT = (pagosPorTratamiento.get(idTrat) || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const gastosT = (gastosPorTratamiento.get(idTrat) || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

      const resumen = calcularDistribucionFija(tratamiento.toObject(), gastosT, pagosT);

      const item = {
        tratamientoId: tratamiento._id,
        paciente: tratamiento.pacienteId,
        fechaInicio: tratamiento.fechaInicio,
        estado: tratamiento.estado,
        descripcion: tratamiento.descripcion,

        totalPagadoPaciente: resumen.totalPagado,
        saldoPaciente: resumen.saldo.paciente,

        objetivoMama: resumen.objetivo.mama,
        pagadoMama: resumen.pagado.mama,
        saldoMama: resumen.saldo.mama,

        objetivoAlicia: resumen.objetivo.alicia,
        pagadoAlicia: resumen.pagado.alicia,
        saldoAlicia: resumen.saldo.alicia,
      };

      if (resumen.saldo.mama > 0) {
        pendientesMama.push(item);
      } else if (resumen.saldo.mama === 0 && resumen.saldo.alicia > 0) {
        pendientesAlicia.push(item);
      }
    }

    pendientesMama.sort((a, b) => b.saldoMama - a.saldoMama);
    pendientesAlicia.sort((a, b) => b.saldoAlicia - a.saldoAlicia);

    return res.json({
      periodo: { anio, mes, hastaExclusivo: finMesExclusivo },
      pendientesMama,
      pendientesAlicia,
      totales: {
        cantidadPendientesMama: pendientesMama.length,
        cantidadPendientesAlicia: pendientesAlicia.length,
        sumaPendienteMama: pendientesMama.reduce((acc, x) => acc + x.saldoMama, 0),
        sumaPendienteAlicia: pendientesAlicia.reduce((acc, x) => acc + x.saldoAlicia, 0),
      },
    });
  } catch (error) {
    return responderServerError(res, "Error al obtener pendientes", error);
  }
};

/**
 * Reporte diario:
 * - Cashflow del día (pagos y gastos por fecha)
 * - Totales por método (efectivo/transferencia/tarjeta/otro)
 * - Separación del día (cuánto de lo cobrado HOY va a lab/mamá/alicia según waterfall)
 * - Foto cierre día (saldos al cierre del día SOLO para tratamientos con movimiento hoy)
 *
 * GET /api/reportes/diario?fecha=YYYY-MM-DD
 */
export const obtenerReporteDiario = async (req, res) => {
  try {
    const { fecha } = req.query;
    const rango = obtenerRangoDiario(fecha);
    if (!rango) {
      return responderBadRequest(res, "Parámetro inválido. Use ?fecha=YYYY-MM-DD");
    }

    const { fechaISO, inicioDia, finDiaExclusivo } = rango;

    // 1) movimientos del día
    const [pagosDelDia, gastosDelDia] = await Promise.all([
      Pago.find({ fecha: { $gte: inicioDia, $lt: finDiaExclusivo } }).sort({ fecha: 1 }),
      Gasto.find({ fecha: { $gte: inicioDia, $lt: finDiaExclusivo } }).sort({ fecha: 1 }),
    ]);

    const totalCobradoPacientesDia = pagosDelDia.reduce((acc, p) => acc + (p.monto || 0), 0);

    const porMetodo = {
      efectivo: 0,
      transferencia: 0,
      tarjeta: 0,
      otro: 0,
    };

    for (const p of pagosDelDia) {
      const metodo = p.metodo || "otro";
      if (porMetodo[metodo] === undefined) porMetodo[metodo] = 0;
      porMetodo[metodo] += p.monto || 0;
    }

    const totalGastosDia = gastosDelDia.reduce((acc, g) => acc + (g.monto || 0), 0);

    const totalPagadoLaboratorioDia = gastosDelDia
      .filter((g) => g.tipo === "laboratorio")
      .reduce((acc, g) => acc + (g.monto || 0), 0);

    // Laboratorio comprometido del día (según regla C: gastos de laboratorio del día)
    const laboratorioComprometidoDia = totalPagadoLaboratorioDia;

    // 2) tratamientos relevantes del día (pagos o gastos del día)
    const idsTratamientos = new Set();
    for (const p of pagosDelDia) idsTratamientos.add(String(p.tratamientoId));
    for (const g of gastosDelDia) idsTratamientos.add(String(g.tratamientoId));

    const ids = [...idsTratamientos];

    if (ids.length === 0) {
      return res.json({
        periodo: { fecha: fechaISO, desde: inicioDia, hastaExclusivo: finDiaExclusivo },
        cashflowDelDia: {
          totalCobradoPacientesDia: 0,
          porMetodo,
          cantidadPagosDia: 0,
          totalGastosDia: 0,
          totalPagadoLaboratorioDia: 0,
          cantidadGastosDia: 0,
        },
        separacionDelDia: {
          paraLaboratorio: 0,
          laboratorioCubiertoPorPagos: 0,
          laboratorioPendiente: 0,

          paraMama: 0,
          paraAlicia: 0,
          excedente: 0,
        },
        fotoCierreDia: {
          totalCorrespondienteLaboratorio: 0,
          totalCobradoLaboratorio: 0,
          totalPendienteLaboratorio: 0,

          totalCorrespondienteMama: 0,
          totalCobradoMama: 0,
          totalPendienteMama: 0,

          totalCorrespondienteAlicia: 0,
          totalCobradoAlicia: 0,
          totalPendienteAlicia: 0,

          saldoPendienteTotalPacientes: 0,
          cantidadTratamientosConsiderados: 0,
        },
        detalle: [],
      });
    }

    // 3) Foto cierre: para que sea "al cierre del día", tomamos pagos/gastos HASTA finDiaExclusivo
    const [tratamientos, pagosHastaCierreDia, gastosHastaCierreDia] = await Promise.all([
      Tratamiento.find({ _id: { $in: ids } }).populate("pacienteId").sort({ fechaInicio: -1 }),
      Pago.find({ tratamientoId: { $in: ids }, fecha: { $lt: finDiaExclusivo } }).sort({ fecha: 1 }),
      Gasto.find({ tratamientoId: { $in: ids }, fecha: { $lt: finDiaExclusivo } }).sort({ fecha: 1 }),
    ]);

    const pagosPorTratamiento = new Map();
    for (const pago of pagosHastaCierreDia) {
      const clave = String(pago.tratamientoId);
      if (!pagosPorTratamiento.has(clave)) pagosPorTratamiento.set(clave, []);
      pagosPorTratamiento.get(clave).push(pago);
    }

    const gastosPorTratamiento = new Map();
    for (const gasto of gastosHastaCierreDia) {
      const clave = String(gasto.tratamientoId);
      if (!gastosPorTratamiento.has(clave)) gastosPorTratamiento.set(clave, []);
      gastosPorTratamiento.get(clave).push(gasto);
    }

    // Separación por pagos del día (waterfall)
    let paraLaboratorioPorPagos = 0;
    let paraMama = 0;
    let paraAlicia = 0;
    let excedente = 0;

    const foto = {
      totalCorrespondienteLaboratorio: 0,
      totalCobradoLaboratorio: 0,
      totalPendienteLaboratorio: 0,

      totalCorrespondienteMama: 0,
      totalCobradoMama: 0,
      totalPendienteMama: 0,

      totalCorrespondienteAlicia: 0,
      totalCobradoAlicia: 0,
      totalPendienteAlicia: 0,

      saldoPendienteTotalPacientes: 0,
      cantidadTratamientosConsiderados: 0,
    };

    const detalle = [];

    for (const tratamiento of tratamientos) {
      const idTrat = String(tratamiento._id);

      const pagosT = (pagosPorTratamiento.get(idTrat) || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const gastosT = (gastosPorTratamiento.get(idTrat) || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

      const resumenFinanciero = calcularDistribucionFija(tratamiento.toObject(), gastosT, pagosT);

      const asignacionPorPago = construirAsignacionPorPago(pagosT, resumenFinanciero.objetivo);

      const pagosDeEsteDia = pagosT
        .filter((p) => estaEnRango(p.fecha, inicioDia, finDiaExclusivo))
        .map((p) => {
          const asg = asignacionPorPago.get(String(p._id)) || {
            paraLab: 0,
            paraMama: 0,
            paraAlicia: 0,
            excedente: 0,
          };

          paraLaboratorioPorPagos += asg.paraLab;
          paraMama += asg.paraMama;
          paraAlicia += asg.paraAlicia;
          excedente += asg.excedente;

          return {
            _id: p._id,
            fecha: p.fecha,
            monto: p.monto,
            metodo: p.metodo,
            referencia: p.referencia,
            notas: p.notas,
            asignacion: asg,
          };
        });

      const gastosDeEsteDia = gastosT.filter((g) => estaEnRango(g.fecha, inicioDia, finDiaExclusivo));

      foto.totalCorrespondienteLaboratorio += resumenFinanciero.objetivo.lab;
      foto.totalCobradoLaboratorio += resumenFinanciero.pagado.lab;
      foto.totalPendienteLaboratorio += resumenFinanciero.saldo.lab;

      foto.totalCorrespondienteMama += resumenFinanciero.objetivo.mama;
      foto.totalCobradoMama += resumenFinanciero.pagado.mama;
      foto.totalPendienteMama += resumenFinanciero.saldo.mama;

      foto.totalCorrespondienteAlicia += resumenFinanciero.objetivo.alicia;
      foto.totalCobradoAlicia += resumenFinanciero.pagado.alicia;
      foto.totalPendienteAlicia += resumenFinanciero.saldo.alicia;

      foto.saldoPendienteTotalPacientes += resumenFinanciero.saldo.paciente;
      foto.cantidadTratamientosConsiderados += 1;

      detalle.push({
        tratamientoId: tratamiento._id,
        paciente: tratamiento.pacienteId,
        tratamiento,
        resumenFinanciero,
        pagosDelDia: pagosDeEsteDia,
        gastosDelDia: gastosDeEsteDia,
      });
    }

    // Nuevo significado: "paraLaboratorio" = laboratorio comprometido del día
    const paraLaboratorio = laboratorioComprometidoDia;

    const laboratorioCubiertoPorPagos = paraLaboratorioPorPagos;
    const laboratorioPendiente = paraLaboratorio - laboratorioCubiertoPorPagos;

    return res.json({
      periodo: { fecha: fechaISO, desde: inicioDia, hastaExclusivo: finDiaExclusivo },
      cashflowDelDia: {
        totalCobradoPacientesDia,
        porMetodo,
        cantidadPagosDia: pagosDelDia.length,
        totalGastosDia,
        totalPagadoLaboratorioDia,
        cantidadGastosDia: gastosDelDia.length,
      },
      separacionDelDia: {
        paraLaboratorio,
        laboratorioCubiertoPorPagos,
        laboratorioPendiente,

        paraMama,
        paraAlicia,
        excedente,
      },
      fotoCierreDia: foto,
      detalle,
    });
  } catch (error) {
    return responderServerError(res, "Error al generar reporte diario", error);
  }
};
