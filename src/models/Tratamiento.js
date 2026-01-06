import mongoose from "mongoose";

const tratamientoSchema = new mongoose.Schema(
  {
    pacienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paciente",
      required: true,
      index: true,
    },

    tipo: {
      type: String,
      enum: ["endodoncia", "perno", "ambos", "otro"],
      default: "ambos",
      index: true,
    },

    descripcion: { type: String, trim: true, maxlength: 300 },

    // Montos fijos (en pesos enteros)
    precioPaciente: { type: Number, required: true, min: 0 },
    montoMama: { type: Number, required: true, min: 0 },
    montoAlicia: { type: Number, required: true, min: 0 },

    // Cómo ajustar si precioPaciente != (labReal + mama + alicia)
    reglaAjuste: {
      type: String,
      enum: ["mama", "alicia", "prorrateo"],
      default: "mama",
    },

    estado: {
      type: String,
      enum: ["activo", "finalizado", "cancelado"],
      default: "activo",
      index: true,
    },

    fechaInicio: { type: Date, default: Date.now, index: true },
    fechaFin: { type: Date },
  },
  { timestamps: true }
);

tratamientoSchema.index({ pacienteId: 1, fechaInicio: -1 });

export const Tratamiento = mongoose.model("Tratamiento", tratamientoSchema);
