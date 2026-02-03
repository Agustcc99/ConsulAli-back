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

    /**
     * Compat / histórico:
     * - Si modoDistribucion = "manual": estos montos SON la verdad (snapshot)
     * - Si modoDistribucion = "auto": pueden quedar en 0 o como referencia, pero no son la fuente del cálculo.
     */
    montoMama: { type: Number, default: 0, min: 0 },
    montoAlicia: { type: Number, default: 0, min: 0 },

    /**
     * NUEVO: modo de distribución
     * - manual: usar montoMama/montoAlicia tal cual están guardados
     * - auto: calcular con porcentaje "congelado" (porcentajeMamaUsado/porcentajeAliciaUsado)
     *
     * Default "auto" para mantener el comportamiento actual.
     */
    modoDistribucion: {
      type: String,
      enum: ["auto", "manual"],
      default: "auto",
      index: true,
    },

    /**
     * NUEVO: snapshot de porcentajes usados (para que cambios futuros no afecten el pasado)
     * Se aplican sobre el NETO (precioPaciente - labReal), como ya venías haciendo.
     */
    porcentajeMamaUsado: { type: Number, min: 0, max: 100 },
    porcentajeAliciaUsado: { type: Number, min: 0, max: 100 },

    // Se deja por compatibilidad (ya no afecta la cuenta nueva)
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
