import { Router } from "express";
import { validateObjectId } from "../middlewares/validateObjectId.js";
import {
  crearTratamiento,
  listarTratamientos,
  actualizarTratamiento,
  actualizarEstadoTratamiento,
  obtenerResumenFinancieroTratamiento,
  eliminarTratamiento,
} from "../controllers/tratamientos.controller.js";

const router = Router();

router.get("/", listarTratamientos);
router.post("/", crearTratamiento);

router.get("/:id/resumen-financiero", validateObjectId("id"), obtenerResumenFinancieroTratamiento);
router.put("/:id", validateObjectId("id"), actualizarTratamiento);
router.patch("/:id/estado", validateObjectId("id"), actualizarEstadoTratamiento);

// DELETE /api/tratamientos/:id?modo=cancelar|eliminar
router.delete("/:id", validateObjectId("id"), eliminarTratamiento);

export default router;
