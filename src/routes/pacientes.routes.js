import { Router } from "express";
import { validateObjectId } from "../middlewares/validateObjectId.js";
import {
  listarPacientes,
  crearPaciente,
  obtenerResumenPaciente,
  eliminarPaciente,
  actualizarPaciente,
} from "../controllers/pacientes.controller.js";

const router = Router();

router.get("/", listarPacientes);
router.post("/", crearPaciente);

// Editar paciente (ahora sí existe en backend)
router.put("/:id", validateObjectId("id"), actualizarPaciente);

// Resumen financiero del paciente
router.get("/:id/resumen", validateObjectId("id"), obtenerResumenPaciente);

// Borrado (por defecto ARCHIVA -> activo=false)
router.delete("/:id", validateObjectId("id"), eliminarPaciente);

export default router;
