import mongoose from "mongoose";

const pacienteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 120 },

    // Para diferenciar pacientes con mismo nombre (opcional)
    documento: { type: String, trim: true, maxlength: 40 },

    telefono: { type: String, trim: true, maxlength: 40 },
    observaciones: { type: String, trim: true, maxlength: 1000 },

    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pacienteSchema.index({ nombre: 1 });

export const Paciente = mongoose.model("Paciente", pacienteSchema);
