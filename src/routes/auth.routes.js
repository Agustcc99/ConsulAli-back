import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  login,
  logout,
  me,
  listarUsuarios,
  crearUsuario,
  generarResetToken,
  establecerPassword,
  cambiarPassword,
} from "../controllers/auth.controller.js";

const router = Router();

const limiterLogin = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", limiterLogin, login);
router.post("/logout", logout);
router.get("/me", me);

// Admin
router.get("/usuarios", requireAuth, requireRole("admin"), listarUsuarios);
router.post("/usuarios", requireAuth, requireRole("admin"), crearUsuario);
router.post("/usuarios/reset-token", requireAuth, requireRole("admin"), generarResetToken);

// Público: el usuario usa el token
router.post("/establecer-password", establecerPassword);

// Logueado
router.post("/cambiar-password", requireAuth, cambiarPassword);

export default router;
