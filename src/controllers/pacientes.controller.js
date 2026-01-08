import mongoose from "mongoose";
import { Paciente } from "../models/Paciente.js";
import { Tratamiento } from "../models/Tratamiento.js";
import { Pago } from "../models/Pago.js";
import { Gasto } from "../models/Gasto.js";
import { calcularDistribucionFija } from "../services/finanzas.service.js";

function hardDeleteHabilitado() {
  return String(process.env.ALLOW_HARD_DELETE || "").trim() === "1";
}

// GET /api/pacientes?q=texto&incluirInactivos=1
export const listarPacientes = async (req, res) => {
  try {
    const { q, incluirInactivos } = req.query;

    const filtro = {};

    // Por defecto: solo activos
    if (!String(incluirInactivos || "").trim()) {
      filtro.activo = true;
    }

    if (q?.trim()) {
      const texto = q.trim();
      filtro.$or = [
        { nombre: { $regex: texto, $options: "i" } },
        { telefono: { $regex: texto, $options: "i" } },
        { documento: { $regex: texto, $options: "i" } },
      ];
    }

    const pacientes = await Paciente.find(filtro).sort({ nombre: 1 }).limit(200);
    return res.json(pacientes);
  } catch (error) {
    return res.status(500).json({
      message: "Error al listar pacientes",
      error: error.message,
    });
  }
};

// POST /api/pacientes
export const crearPaciente = async (req, res) => {
  try {
    const { nombre, telefono, observaciones, documento } = req.body;

    if (!nombre?.trim()) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    const pacienteCreado = await Paciente.create({
      nombre: nombre.trim(),
      telefono: telefono?.trim() || "",
      observaciones: observaciones?.trim() || "",
      documento: documento?.trim() || "",
    });

    return res.status(201).json(pacienteCreado);
  } catch (error) {
    return res.status(500).json({
      message: "Error al crear el paciente",
      error: error.message,
    });
  }
};

// PUT /api/pacientes/:id
export const actualizarPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    const camposPermitidos = ["nombre", "telefono", "observaciones", "documento"];
    const actualizacion = {};

    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) {
        const valor = typeof req.body[campo] === "string" ? req.body[campo].trim() : req.body[campo];
        actualizacion[campo] = valor;
      }
    }

    if (actualizacion.nombre !== undefined && !actualizacion.nombre) {
      return res.status(400).json({ message: "El nombre no puede quedar vacío" });
    }

    const pacienteActualizado = await Paciente.findByIdAndUpdate(id, actualizacion, {
      new: true,
      runValidators: true,
    });

    if (!pacienteActualizado) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    return res.json(pacienteActualizado);
  } catch (error) {
    return res.status(500).json({
      message: "Error al actualizar el paciente",
      error: error.message,
    });
  }
};

// GET /api/pacientes/:id/resumen
export const obtenerResumenPaciente = async (req, res) => {
  try {
    const { id: idPaciente } = req.params;

    const paciente = await Paciente.findById(idPaciente);
    if (!paciente) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    // Excluimos tratamientos "cancelado"
    const tratamientosDelPaciente = await Tratamiento.find({
      pacienteId: idPaciente,
      estado: { $ne: "cancelado" },
    }).sort({ fechaInicio: -1 });

    const idsTratamientos = tratamientosDelPaciente.map((t) => t._id);

    const [pagos, gastos] = await Promise.all([
      Pago.find({ tratamientoId: { $in: idsTratamientos } }),
      Gasto.find({ tratamientoId: { $in: idsTratamientos } }),
    ]);

    const pagosPorTratamiento = new Map();
    for (const pago of pagos) {
      const clave = String(pago.tratamientoId);
      if (!pagosPorTratamiento.has(clave)) pagosPorTratamiento.set(clave, []);
      pagosPorTratamiento.get(clave).push(pago);
    }

    const gastosPorTratamiento = new Map();
    for (const gasto of gastos) {
      const clave = String(gasto.tratamientoId);
      if (!gastosPorTratamiento.has(clave)) gastosPorTratamiento.set(clave, []);
      gastosPorTratamiento.get(clave).push(gasto);
    }

    const tratamientos = tratamientosDelPaciente.map((tratamiento) => {
      const idTratamiento = String(tratamiento._id);

      const pagosDelTratamiento = (pagosPorTratamiento.get(idTratamiento) || []).sort(
        (a, b) => new Date(a.fecha) - new Date(b.fecha)
      );

      const gastosDelTratamiento = (gastosPorTratamiento.get(idTratamiento) || []).sort(
        (a, b) => new Date(a.fecha) - new Date(b.fecha)
      );

      const resumenFinanciero = calcularDistribucionFija(
        tratamiento.toObject(),
        gastosDelTratamiento,
        pagosDelTratamiento
      );

      return { tratamiento, resumenFinanciero };
    });

    const totales = tratamientos.reduce(
      (acum, item) => {
        const r = item.resumenFinanciero;

        acum.totalPagado += r.totalPagado;
        acum.saldoPaciente += r.saldo.paciente;

        acum.objetivoMama += r.objetivo.mama;
        acum.pagadoMama += r.pagado.mama;

        acum.objetivoAlicia += r.objetivo.alicia;
        acum.pagadoAlicia += r.pagado.alicia;

        acum.objetivoLaboratorio += r.objetivo.lab;
        acum.pagadoLaboratorio += r.pagado.lab;

        return acum;
      },
      {
        totalPagado: 0,
        saldoPaciente: 0,
        objetivoMama: 0,
        pagadoMama: 0,
        objetivoAlicia: 0,
        pagadoAlicia: 0,
        objetivoLaboratorio: 0,
        pagadoLaboratorio: 0,
      }
    );

    totales.saldoMama = totales.objetivoMama - totales.pagadoMama;
    totales.saldoAlicia = totales.objetivoAlicia - totales.pagadoAlicia;
    totales.saldoLaboratorio = totales.objetivoLaboratorio - totales.pagadoLaboratorio;

    return res.json({ idPaciente, paciente, tratamientos, totales });
  } catch (error) {
    return res.status(500).json({
      message: "Error al obtener el resumen del paciente",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/pacientes/:id?modo=archivar|eliminar
 * - archivar (default): activo=false
 * - eliminar: borra paciente + tratamientos + pagos + gastos (IRREVERSIBLE)
 *   Requiere ALLOW_HARD_DELETE=1
 */
export const eliminarPaciente = async (req, res) => {
  try {
    const { id } = req.params;
    const modo = String(req.query.modo || "archivar").toLowerCase();

    const paciente = await Paciente.findById(id);
    if (!paciente) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    if (modo === "archivar") {
      if (paciente.activo === false) {
        return res.json({ ok: true, modo, message: "El paciente ya estaba archivado", paciente });
      }
      paciente.activo = false;
      await paciente.save();
      return res.json({ ok: true, modo, message: "Paciente archivado (activo=false)", paciente });
    }

    if (modo !== "eliminar") {
      return res.status(400).json({ message: "modo inválido. Use ?modo=archivar o ?modo=eliminar" });
    }

    if (!hardDeleteHabilitado()) {
      return res.status(403).json({
        message: "Hard delete deshabilitado. Para habilitarlo setear ALLOW_HARD_DELETE=1 en el servidor.",
      });
    }

    // Intentamos transacción para evitar estados intermedios
    const session = await mongoose.startSession();

    try {
      let tratamientosEliminados = 0;

      await session.withTransaction(async () => {
        const tratamientos = await Tratamiento.find({ pacienteId: id }, { _id: 1 }, { session });
        const idsTratamientos = tratamientos.map((t) => t._id);
        tratamientosEliminados = idsTratamientos.length;

        if (idsTratamientos.length) {
          await Pago.deleteMany({ tratamientoId: { $in: idsTratamientos } }, { session });
          await Gasto.deleteMany({ tratamientoId: { $in: idsTratamientos } }, { session });
          await Tratamiento.deleteMany({ _id: { $in: idsTratamientos } }, { session });
        }

        await Paciente.deleteOne({ _id: id }, { session });
      });

      return res.json({
        ok: true,
        modo,
        message: "Paciente eliminado definitivamente (cascade)",
        tratamientosEliminados,
      });
    } catch (e) {
      // Fallback si tu Mongo no soporta transacciones
      if (String(e?.message || "").toLowerCase().includes("transaction")) {
        const tratamientos = await Tratamiento.find({ pacienteId: id }, { _id: 1 });
        const idsTratamientos = tratamientos.map((t) => t._id);

        if (idsTratamientos.length) {
          await Pago.deleteMany({ tratamientoId: { $in: idsTratamientos } });
          await Gasto.deleteMany({ tratamientoId: { $in: idsTratamientos } });
          await Tratamiento.deleteMany({ _id: { $in: idsTratamientos } });
        }

        await Paciente.findByIdAndDelete(id);

        return res.json({
          ok: true,
          modo,
          message: "Paciente eliminado definitivamente (cascade, sin transacción)",
          tratamientosEliminados: idsTratamientos.length,
        });
      }

      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    return res.status(500).json({
      message: "Error al eliminar paciente",
      error: error.message,
    });
  }
};
