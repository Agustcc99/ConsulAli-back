import { Router } from "express";

import authRoutes from "./auth.routes.js";
import pacientesRoutes from "./pacientes.routes.js";
import tratamientosRoutes from "./tratamientos.routes.js";
import pagosRoutes from "./pagos.routes.js";
import gastosRoutes from "./gastos.routes.js";
import reportesRoutes from "./reportes.routes.js";

import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/health", (req, res) => res.json({ ok: true, message: "API OK" }));

router.use("/auth", authRoutes);

// todo lo demás: protegido cuando AUTH_ENABLED=1
router.use(requireAuth);

router.use("/pacientes", pacientesRoutes);
router.use("/tratamientos", tratamientosRoutes);
router.use("/pagos", pagosRoutes);
router.use("/gastos", gastosRoutes);
router.use("/reportes", reportesRoutes);

export default router;
