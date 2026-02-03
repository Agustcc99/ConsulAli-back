import { Tratamiento } from "../models/Tratamiento.js";
import { Paciente } from "../models/Paciente.js";
import { Pago } from "../models/Pago.js";
import { Gasto } from "../models/Gasto.js";
import { calcularDistribucionFija } from "../services/finanzas.service.js";
import { esEnteroNoNegativo } from "../utils/validaciones.js";
import {
  responderBadRequest,
  responderNotFound,
  responderServerError,
} from "../utils/respuestas.js";

function hardDeleteHabilitado() {
  return String(process.env.ALLOW_HARD_DELETE || "").trim() === "1";
}

/**
 * Por ahora dejamos defaults para NO romper nada.
 * Cuando conectemos tu "API de finanzas", acá vas a buscar el porcentaje vigente.
 */
function obtenerPorcentajesVigentesFallback() {
  // El que venías usando como base
  const porcentajeMama = 68.42105;
  const porcentajeAlicia = 100 - porcentajeMama;

  return { porcentajeMama, porcentajeAlicia };
}

async function tienePagosAsociados(tratamientoId) {
  return !!(await Pago.exists({ tratamientoId }));
}

// POST /api/tratamientos
export const crearTratamiento = async (req, res) => {
  try {
    const {
      pacienteId,
      tipo,
      descripcion,
      precioPaciente,
      montoMama,
      montoAlicia,
      reglaAjuste,
    } = req.body;

    if (!pacienteId) {
      return responderBadRequest(res, "pacienteId es obligatorio");
    }

    const pacienteExiste = await Paciente.exists({ _id: pacienteId, activo: true });
    if (!pacienteExiste) {
      return responderNotFound(res, "El paciente no existe");
    }

    if (!esEnteroNoNegativo(precioPaciente)) {
      return responderBadRequest(res, "precioPaciente debe ser un número entero >= 0");
    }

    // Si vienen montos, los validamos.
    if (montoMama !== undefined && !esEnteroNoNegativo(montoMama)) {
      return responderBadRequest(res, "montoMama debe ser un número entero >= 0");
    }
    if (montoAlicia !== undefined && !esEnteroNoNegativo(montoAlicia)) {
      return responderBadRequest(res, "montoAlicia debe ser un número entero >= 0");
    }

    const montoMamaVal = montoMama ?? 0;
    const montoAliciaVal = montoAlicia ?? 0;

    // ✅ Si mandan cualquier monto (como antes), lo tratamos como MANUAL
    const esManual = montoMama !== undefined || montoAlicia !== undefined;

    const doc = {
      pacienteId,
      tipo,
      descripcion,
      precioPaciente,
      montoMama: montoMamaVal,
      montoAlicia: montoAliciaVal,
      reglaAjuste,
      modoDistribucion: esManual ? "manual" : "auto",
    };

    // ✅ Si es auto, congelamos porcentajes usados (snapshot)
    if (!esManual) {
      const { porcentajeMama, porcentajeAlicia } = obtenerPorcentajesVigentesFallback();
      doc.porcentajeMamaUsado = porcentajeMama;
      doc.porcentajeAliciaUsado = porcentajeAlicia;
    }

    const tratamientoCreado = await Tratamiento.create(doc);

    return res.status(201).json(tratamientoCreado);
  } catch (error) {
    return responderServerError(res, "Error al crear el tratamiento", error);
  }
};

// GET /api/tratamientos?pacienteId=...&estado=...&incluirCancelados=1
export const listarTratamientos = async (req, res) => {
  try {
    const { pacienteId, estado, incluirCancelados } = req.query;

    const filtro = {};
    if (pacienteId) filtro.pacienteId = pacienteId;

    if (estado) {
      filtro.estado = estado;
    } else if (!String(incluirCancelados || "").trim()) {
      filtro.estado = { $ne: "cancelado" };
    }

    const tratamientos = await Tratamiento.find(filtro)
      .populate("pacienteId")
      .sort({ fechaInicio: -1 })
      .limit(300);

    return res.json(tratamientos);
  } catch (error) {
    return res.status(500).json({
      message: "Error al listar tratamientos",
      error: error.message,
    });
  }
};

// PUT /api/tratamientos/:id
export const actualizarTratamiento = async (req, res) => {
  try {
    const { id } = req.params;

    const tratamientoActual = await Tratamiento.findById(id);
    if (!tratamientoActual) {
      return responderNotFound(res, "Tratamiento no encontrado");
    }

    const camposPermitidos = [
      "tipo",
      "descripcion",
      "precioPaciente",
      "montoMama",
      "montoAlicia",
      "reglaAjuste",
      "fechaInicio",
      "fechaFin",
      "estado",
      // modoDistribucion/porcentajes los dejamos para más adelante con front,
      // pero no rompemos nada si los mandan.
      "modoDistribucion",
      "porcentajeMamaUsado",
      "porcentajeAliciaUsado",
    ];

    const actualizacion = {};
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) actualizacion[campo] = req.body[campo];
    }

    // Validaciones suaves (mantener consistencia con enteros)
    if (actualizacion.precioPaciente !== undefined && !esEnteroNoNegativo(actualizacion.precioPaciente)) {
      return responderBadRequest(res, "precioPaciente debe ser un número entero >= 0");
    }
    if (actualizacion.montoMama !== undefined && !esEnteroNoNegativo(actualizacion.montoMama)) {
      return responderBadRequest(res, "montoMama debe ser un número entero >= 0");
    }
    if (actualizacion.montoAlicia !== undefined && !esEnteroNoNegativo(actualizacion.montoAlicia)) {
      return responderBadRequest(res, "montoAlicia debe ser un número entero >= 0");
    }

    // ✅ Bloqueo: si hay pagos, no permitir cambios financieros (precio/montos/modo/porcentajes)
    const intentoCambioFinanciero =
      actualizacion.precioPaciente !== undefined ||
      actualizacion.montoMama !== undefined ||
      actualizacion.montoAlicia !== undefined ||
      actualizacion.modoDistribucion !== undefined ||
      actualizacion.porcentajeMamaUsado !== undefined ||
      actualizacion.porcentajeAliciaUsado !== undefined;

    if (intentoCambioFinanciero) {
      const hayPagos = await tienePagosAsociados(id);
      if (hayPagos) {
        return responderBadRequest(
          res,
          "No se permiten cambios financieros en un tratamiento que ya tiene pagos cargados"
        );
      }
    }

    // ✅ Compat: si mandan montos, asumimos manual (como antes)
    const mandaronMontos = actualizacion.montoMama !== undefined || actualizacion.montoAlicia !== undefined;
    if (mandaronMontos && actualizacion.modoDistribucion === undefined) {
      actualizacion.modoDistribucion = "manual";
    }

    const tratamientoActualizado = await Tratamiento.findByIdAndUpdate(id, actualizacion, {
      new: true,
      runValidators: true,
    });

    return res.json(tratamientoActualizado);
  } catch (error) {
    return res.status(500).json({
      message: "Error al actualizar el tratamiento",
      error: error.message,
    });
  }
};

// PATCH /api/tratamientos/:id/estado
export const actualizarEstadoTratamiento = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosPermitidos = ["activo", "finalizado", "cancelado"];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({
        message: "Estado inválido. Use: activo, finalizado o cancelado",
      });
    }

    const tratamientoActualizado = await Tratamiento.findByIdAndUpdate(
      id,
      { estado },
      { new: true, runValidators: true }
    );

    if (!tratamientoActualizado) {
      return res.status(404).json({ message: "Tratamiento no encontrado" });
    }

    return res.json(tratamientoActualizado);
  } catch (error) {
    return res.status(500).json({
      message: "Error al actualizar el estado del tratamiento",
      error: error.message,
    });
  }
};

// GET /api/tratamientos/:id/resumen-financiero
export const obtenerResumenFinancieroTratamiento = async (req, res) => {
  try {
    const { id } = req.params;

    const tratamiento = await Tratamiento.findById(id).populate("pacienteId");
    if (!tratamiento) {
      return res.status(404).json({ message: "Tratamiento no encontrado" });
    }

    const [pagos, gastos] = await Promise.all([
      Pago.find({ tratamientoId: id }).sort({ fecha: 1 }),
      Gasto.find({ tratamientoId: id }).sort({ fecha: 1 }),
    ]);

    const resumen = calcularDistribucionFija(tratamiento.toObject(), gastos, pagos);

    return res.json({ tratamiento, pagos, gastos, resumen });
  } catch (error) {
    return res.status(500).json({
      message: "Error al obtener resumen financiero del tratamiento",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/tratamientos/:id?modo=cancelar|eliminar
 * - cancelar (default): estado="cancelado"
 * - eliminar: borra tratamiento + pagos + gastos (IRREVERSIBLE)
 *   Requiere ALLOW_HARD_DELETE=1
 */
export const eliminarTratamiento = async (req, res) => {
  try {
    const { id } = req.params;
    const modo = String(req.query.modo || "cancelar").toLowerCase();

    const tratamiento = await Tratamiento.findById(id);
    if (!tratamiento) return responderNotFound(res, "Tratamiento no encontrado");

    if (modo === "cancelar") {
      if (tratamiento.estado === "cancelado") {
        return res.json({ ok: true, modo, message: "El tratamiento ya estaba cancelado", tratamiento });
      }

      tratamiento.estado = "cancelado";
      tratamiento.fechaFin = new Date();
      await tratamiento.save();

      return res.json({ ok: true, modo, message: "Tratamiento cancelado", tratamiento });
    }

    if (modo !== "eliminar") {
      return responderBadRequest(res, "modo inválido. Use ?modo=cancelar o ?modo=eliminar");
    }

    if (!hardDeleteHabilitado()) {
      return res.status(403).json({
        message: "Hard delete deshabilitado. Para habilitarlo setear ALLOW_HARD_DELETE=1 en el servidor.",
      });
    }

    await Promise.all([
      Pago.deleteMany({ tratamientoId: id }),
      Gasto.deleteMany({ tratamientoId: id }),
      Tratamiento.findByIdAndDelete(id),
    ]);

    return res.json({ ok: true, modo, message: "Tratamiento eliminado definitivamente (cascade)" });
  } catch (error) {
    return responderServerError(res, "Error al eliminar tratamiento", error);
  }
};
