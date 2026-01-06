import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Usuario } from "../models/Usuario.js";
import { authEnabled, cookieName, jwtSecret } from "../middlewares/requireAuth.js";

function diasAms(dias) {
  return Number(dias || 7) * 24 * 60 * 60 * 1000;
}

function opcionesCookie() {
  return {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    secure: String(process.env.COOKIE_SECURE || "0") === "1",
    path: "/",
    maxAge: diasAms(process.env.JWT_EXPIRES_DAYS || 7),
  };
}

function firmarToken(usuario) {
  const payload = { uid: String(usuario._id), rol: usuario.rol, email: usuario.email };
  return jwt.sign(payload, jwtSecret(), { expiresIn: `${process.env.JWT_EXPIRES_DAYS || 7}d` });
}

function publico(usuario) {
  return {
    id: usuario._id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    debeCambiarPassword: usuario.debeCambiarPassword,
    activo: usuario.activo,
    createdAt: usuario.createdAt,
  };
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) return res.status(400).json({ message: "Email y password son obligatorios" });

    const usuario = await Usuario.findOne({ email, activo: true });
    if (!usuario || !usuario.passwordHash) return res.status(401).json({ message: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, usuario.passwordHash);
    if (!ok) return res.status(401).json({ message: "Credenciales inválidas" });

    const token = firmarToken(usuario);
    res.cookie(cookieName(), token, opcionesCookie());

    return res.json({ authEnabled: authEnabled(), usuario: publico(usuario) });
  } catch (e) {
    return res.status(500).json({ message: "Error en login", error: e.message });
  }
}

// POST /api/auth/logout
export async function logout(req, res) {
  res.clearCookie(cookieName(), {
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    secure: String(process.env.COOKIE_SECURE || "0") === "1",
    path: "/",
  });
  return res.json({ ok: true });
}

// GET /api/auth/me
export async function me(req, res) {
  const enabled = authEnabled();
  const token = req.cookies?.[cookieName()];

  if (!token) {
    if (enabled) return res.status(401).json({ message: "No autorizado" });
    return res.json({ authEnabled: enabled, usuario: null });
  }

  try {
    const payload = jwt.verify(token, jwtSecret());
    const usuario = await Usuario.findById(payload.uid);
    if (!usuario || !usuario.activo) {
      res.clearCookie(cookieName(), { path: "/" });
      if (enabled) return res.status(401).json({ message: "No autorizado" });
      return res.json({ authEnabled: enabled, usuario: null });
    }
    return res.json({ authEnabled: enabled, usuario: publico(usuario) });
  } catch {
    res.clearCookie(cookieName(), { path: "/" });
    if (enabled) return res.status(401).json({ message: "Token inválido" });
    return res.json({ authEnabled: enabled, usuario: null });
  }
}

// GET /api/auth/usuarios?q=&limit=20  (admin) -> lista chica
export async function listarUsuarios(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const limitRaw = Number(req.query.limit || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

    const filtro = {};
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filtro.$or = [{ email: re }, { nombre: re }];
    }

    const usuarios = await Usuario.find(filtro)
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json({ usuarios: usuarios.map(publico) });
  } catch (e) {
    return res.status(500).json({ message: "Error al listar usuarios", error: e.message });
  }
}

// POST /api/auth/usuarios (admin) -> crea usuario SIN password y devuelve token 1 sola vez para setear password
// POST /api/auth/usuarios (admin)
// - Si viene passwordInicial => crea usuario con password y NO genera token
// - Si NO viene passwordInicial => crea sin password y genera token 1 sola vez
export async function crearUsuario(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const nombre = String(req.body.nombre || "").trim();
    const rol = req.body.rol === "admin" ? "admin" : "user";
    const passwordInicial = String(req.body.passwordInicial || "");

    if (!email) return res.status(400).json({ message: "email es obligatorio" });

    const ya = await Usuario.findOne({ email });
    if (ya) return res.status(400).json({ message: "Ya existe un usuario con ese email" });

    // Caso A: se define contraseña inicial (usuario puede loguearse ya)
    if (passwordInicial) {
      if (passwordInicial.length < 8) {
        return res.status(400).json({ message: "passwordInicial debe tener al menos 8 caracteres" });
      }

      const passwordHash = await bcrypt.hash(passwordInicial, 10);

      const usuario = await Usuario.create({
        email,
        nombre,
        rol,
        passwordHash,
        debeCambiarPassword: false,
        resetTokenHash: "",
        resetTokenExpira: null,
        activo: true,
      });

      return res.status(201).json({ usuario: publico(usuario) });
    }

    // Caso B: sin contraseña => token de alta (como antes)
    const tokenPlano = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(tokenPlano).digest("hex");

    const usuario = await Usuario.create({
      email,
      nombre,
      rol,
      passwordHash: "",
      debeCambiarPassword: true,
      resetTokenHash: tokenHash,
      resetTokenExpira: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      activo: true,
    });

    return res.status(201).json({
      usuario: publico(usuario),
      tokenCrearPassword: tokenPlano,
      expira: usuario.resetTokenExpira,
    });
  } catch (e) {
    return res.status(500).json({ message: "Error al crear usuario", error: e.message });
  }
}


// POST /api/auth/usuarios/reset-token (admin) { email } -> genera token para usuario existente (reset conveniente)
export async function generarResetToken(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "email es obligatorio" });

    const usuario = await Usuario.findOne({ email, activo: true });
    if (!usuario) return res.status(404).json({ message: "Usuario no encontrado" });

    const tokenPlano = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(tokenPlano).digest("hex");

    usuario.resetTokenHash = tokenHash;
    usuario.resetTokenExpira = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    // Reset conveniente: NO tocamos passwordHash. La contraseña vieja sigue funcionando.
    await usuario.save();

    return res.json({
      usuario: publico(usuario),
      tokenResetPassword: tokenPlano,
      expira: usuario.resetTokenExpira,
    });
  } catch (e) {
    return res.status(500).json({ message: "Error al generar token", error: e.message });
  }
}

// POST /api/auth/establecer-password  { token, nuevoPassword }
export async function establecerPassword(req, res) {
  try {
    const token = String(req.body.token || "").trim();
    const nuevoPassword = String(req.body.nuevoPassword || "");

    if (!token || nuevoPassword.length < 8) {
      return res.status(400).json({ message: "token y nuevoPassword (>=8) son obligatorios" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const usuario = await Usuario.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpira: { $gt: new Date() },
      activo: true,
    });

    if (!usuario) return res.status(400).json({ message: "Token inválido o expirado" });

    usuario.passwordHash = await bcrypt.hash(nuevoPassword, 10);
    usuario.debeCambiarPassword = false;
    usuario.resetTokenHash = "";
    usuario.resetTokenExpira = null;

    await usuario.save();

    return res.json({ ok: true, message: "Password establecida. Ya podés iniciar sesión." });
  } catch (e) {
    return res.status(500).json({ message: "Error al establecer password", error: e.message });
  }
}

// POST /api/auth/cambiar-password (logueado) { passwordActual, nuevoPassword }
export async function cambiarPassword(req, res) {
  try {
    const userId = req.usuario?.id;
    const passwordActual = String(req.body.passwordActual || "");
    const nuevoPassword = String(req.body.nuevoPassword || "");

    if (!passwordActual || nuevoPassword.length < 8) {
      return res.status(400).json({ message: "passwordActual y nuevoPassword (>=8) son obligatorios" });
    }

    const usuario = await Usuario.findById(userId);
    if (!usuario || !usuario.activo) return res.status(404).json({ message: "Usuario no encontrado" });

    const ok = await bcrypt.compare(passwordActual, usuario.passwordHash || "");
    if (!ok) return res.status(401).json({ message: "Password actual incorrecta" });

    usuario.passwordHash = await bcrypt.hash(nuevoPassword, 10);
    usuario.debeCambiarPassword = false;
    await usuario.save();

    return res.json({ ok: true, message: "Password cambiada" });
  } catch (e) {
    return res.status(500).json({ message: "Error al cambiar password", error: e.message });
  }
}
