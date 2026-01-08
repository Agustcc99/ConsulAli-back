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
    if (!esEnteroNoNegativo(montoMama)) {
      return responderBadRequest(res, "montoMama debe ser un número entero >= 0");
    }
    if (!esEnteroNoNegativo(montoAlicia)) {
      return responderBadRequest(res, "montoAlicia debe ser un número entero >= 0");
    }

    const tratamientoCreado = await Tratamiento.create({
      pacienteId,
      tipo,
      descripcion,
      precioPaciente,
      montoMama,
      montoAlicia,
      reglaAjuste,
    });

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
    ];

    const actualizacion = {};
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) actualizacion[campo] = req.body[campo];
    }

    const tratamientoActualizado = await Tratamiento.findByIdAndUpdate(id, actualizacion, {
      new: true,
      runValidators: true,
    });

    if (!tratamientoActualizado) {
      return res.status(404).json({ message: "Tratamiento no encontrado" });
    }

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
