import mongoose from "mongoose";

const usuarioSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    nombre: { type: String, trim: true, maxlength: 120, default: "" },
    rol: { type: String, enum: ["admin", "user"], default: "user" },

    passwordHash: { type: String, default: "" },
    debeCambiarPassword: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },

    resetTokenHash: { type: String, default: "" },
    resetTokenExpira: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Usuario = mongoose.model("Usuario", usuarioSchema);
