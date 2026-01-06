import mongoose from "mongoose";

const pagoSchema = new mongoose.Schema(
  {
    tratamientoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tratamiento",
      required: true,
      index: true,
    },

    fecha: { type: Date, default: Date.now, index: true },
    monto: { type: Number, required: true, min: 1 },

    metodo: {
      type: String,
      enum: ["efectivo", "transferencia", "tarjeta", "otro"],
      required: true,
      index: true,
    },

    referencia: { type: String, trim: true, maxlength: 80 }, // ej comprobante
    notas: { type: String, trim: true, maxlength: 300 },     // ej "3 cuotas"
  },
  { timestamps: true }
);

pagoSchema.index({ tratamientoId: 1, fecha: -1 });

export const Pago = mongoose.model("Pago", pagoSchema);
