import { Pago } from "../models/Pago.js";
import { Tratamiento } from "../models/Tratamiento.js";
import { esEnteroPositivo } from "../utils/validaciones.js";
import {
  responderBadRequest,
  responderNotFound,
  responderServerError,
} from "../utils/respuestas.js";

// POST /api/pagos
export const crearPago = async (req, res) => {
  try {
    const { tratamientoId, fecha, monto, metodo, referencia, notas } = req.body;

    if (!tratamientoId) return responderBadRequest(res, "tratamientoId es obligatorio");
    if (!esEnteroPositivo(monto)) return responderBadRequest(res, "monto debe ser un entero > 0");
    if (!metodo) return responderBadRequest(res, "metodo es obligatorio");

    const tratamientoExiste = await Tratamiento.exists({ _id: tratamientoId });
    if (!tratamientoExiste) return responderNotFound(res, "El tratamiento no existe");

    const pagoCreado = await Pago.create({
      tratamientoId,
      fecha,
      monto,
      metodo,
      referencia,
      notas,
    });

    return res.status(201).json(pagoCreado);
  } catch (error) {
    return responderServerError(res, "Error al crear pago", error);
  }
};

// DELETE /api/pagos/:id
export const eliminarPago = async (req, res) => {
  try {
    const { id } = req.params;

    const pagoEliminado = await Pago.findByIdAndDelete(id);
    if (!pagoEliminado) return responderNotFound(res, "Pago no encontrado");

    return res.json({ ok: true, message: "Pago eliminado", pago: pagoEliminado });
  } catch (error) {
    return responderServerError(res, "Error al eliminar pago", error);
  }
};
