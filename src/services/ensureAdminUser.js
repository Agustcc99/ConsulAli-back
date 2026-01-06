import bcrypt from "bcryptjs";
import { Usuario } from "../models/Usuario.js";

export async function ensureAdminUser() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "").trim();

  if (!email || !password) {
    console.warn(" ADMIN_EMAIL/ADMIN_PASSWORD no configurados. No se crea admin inicial.");
    return;
  }

  const existe = await Usuario.findOne({ email });
  if (existe) return;

  const passwordHash = await bcrypt.hash(password, 10);

  await Usuario.create({
    email,
    nombre: "Administrador",
    rol: "admin",
    passwordHash,
    activo: true,
  });

  console.log(" Admin inicial creado:", email);
}
