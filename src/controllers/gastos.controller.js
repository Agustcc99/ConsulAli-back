import { Gasto } from "../models/Gasto.js";
import { Tratamiento } from "../models/Tratamiento.js";
import { esEnteroNoNegativo } from "../utils/validaciones.js";
import {
  responderBadRequest,
  responderNotFound,
  responderServerError,
} from "../utils/respuestas.js";

// POST /api/gastos
export const crearGasto = async (req, res) => {
  try {
    const { tratamientoId, tipo, descripcion, monto, fecha, pagado } = req.body;

    if (!tratamientoId) return responderBadRequest(res, "tratamientoId es obligatorio");
    if (!esEnteroNoNegativo(monto)) {
      return responderBadRequest(res, "monto debe ser un entero >= 0");
    }

    const tratamientoExiste = await Tratamiento.exists({ _id: tratamientoId });
    if (!tratamientoExiste) return responderNotFound(res, "El tratamiento no existe");

    const gastoCreado = await Gasto.create({
      tratamientoId,
      tipo,
      descripcion,
      monto,
      fecha,
      pagado,
    });

    return res.status(201).json(gastoCreado);
  } catch (error) {
    return responderServerError(res, "Error al crear gasto", error);
  }
};

// DELETE /api/gastos/:id
export const eliminarGasto = async (req, res) => {
  try {
    const { id } = req.params;

    const gastoEliminado = await Gasto.findByIdAndDelete(id);
    if (!gastoEliminado) return responderNotFound(res, "Gasto no encontrado");

    return res.json({ ok: true, message: "Gasto eliminado", gasto: gastoEliminado });
  } catch (error) {
    return responderServerError(res, "Error al eliminar gasto", error);
  }
};
