import "dotenv/config";
import mongoose from "mongoose";
import { Tratamiento } from "../src/models/Tratamiento.js";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(" Falta MONGODB_URI en .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(" Conectado a MongoDB");

  // Marca como MANUAL todos los tratamientos que tienen montos guardados (histórico)
  const resultado = await Tratamiento.updateMany(
    {
      $or: [{ montoMama: { $gt: 0 } }, { montoAlicia: { $gt: 0 } }],
    },
    { $set: { modoDistribucion: "manual" } }
  );

  console.log(" Tratamientos marcados como manual:", resultado.modifiedCount);

  await mongoose.disconnect();
  console.log(" Listo. Desconectado.");
}

run().catch((e) => {
  console.error(" Error en migración:", e);
  process.exit(1);
});
