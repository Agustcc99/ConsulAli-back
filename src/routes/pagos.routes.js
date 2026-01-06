import { Router } from "express";
import { validateObjectId } from "../middlewares/validateObjectId.js";
import { crearPago, eliminarPago } from "../controllers/pagos.controller.js";

const router = Router();

router.post("/", crearPago);
router.delete("/:id", validateObjectId("id"), eliminarPago);

export default router;
