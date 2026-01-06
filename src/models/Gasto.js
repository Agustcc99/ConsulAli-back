import mongoose from "mongoose";

const gastoSchema = new mongoose.Schema(
  {
    tratamientoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tratamiento",
      required: true,
      index: true,
    },

    tipo: {
      type: String,
      enum: ["laboratorio", "otro"],
      default: "laboratorio",
      index: true,
    },

    descripcion: { type: String, trim: true, maxlength: 200 },
    monto: { type: Number, required: true, min: 0 },

    fecha: { type: Date, default: Date.now, index: true },

    // Si querés marcar "ya lo pagué al lab", lo usás.
    pagado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

gastoSchema.index({ tratamientoId: 1, fecha: -1 });

export const Gasto = mongoose.model("Gasto", gastoSchema);
