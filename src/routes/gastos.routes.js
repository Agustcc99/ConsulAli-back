import { Router } from "express";
import { validateObjectId } from "../middlewares/validateObjectId.js";
import { crearGasto, eliminarGasto } from "../controllers/gastos.controller.js";

const router = Router();

router.post("/", crearGasto);
router.delete("/:id", validateObjectId("id"), eliminarGasto);

export default router;
