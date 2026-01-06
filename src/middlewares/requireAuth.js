import jwt from "jsonwebtoken";

export const authEnabled = () => String(process.env.AUTH_ENABLED || "0") === "1";
export const cookieName = () => process.env.AUTH_COOKIE_NAME || "token";
export const jwtSecret = () => process.env.JWT_SECRET || "dev_secret";

export function requireAuth(req, res, next) {
  if (!authEnabled()) return next();

  const token = req.cookies?.[cookieName()];
  if (!token) return res.status(401).json({ message: "No autorizado" });

  try {
    const payload = jwt.verify(token, jwtSecret());
    req.usuario = { id: payload.uid, rol: payload.rol, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
}
