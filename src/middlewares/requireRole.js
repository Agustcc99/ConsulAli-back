import { authEnabled } from "./requireAuth.js";

export function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!authEnabled()) return next();

    const rol = req.usuario?.rol;
    if (!rol) return res.status(401).json({ message: "No autorizado" });

    if (!rolesPermitidos.includes(rol)) {
      return res.status(403).json({ message: "No tenés permisos para esta acción" });
    }

    next();
  };
}
