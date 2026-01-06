import { Router } from "express";
import {
  obtenerReporteMensual,
  obtenerPendientesMamaYAlicia,
  obtenerReporteDiario,
} from "../controllers/reportes.controller.js";

const router = Router();

/**
 * Reporte mensual
 * GET /api/reportes/mensual?anio=2025&mes=12
 */
router.get("/mensual", obtenerReporteMensual);

/**
 * Pendientes de distribución
 * GET /api/reportes/pendientes?anio=2025&mes=12
 */
router.get("/pendientes", obtenerPendientesMamaYAlicia);

/**
 * Reporte diario (caja del día + separación por lab/mamá/alicia)
 * GET /api/reportes/diario?fecha=YYYY-MM-DD
 * Si no se pasa fecha, toma HOY (hora local del server)
 */
router.get("/diario", obtenerReporteDiario);

export default router;
