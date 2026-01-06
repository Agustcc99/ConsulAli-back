import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./src/config/db.js";
import { ensureAdminUser } from "./src/services/ensureAdminUser.js";

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Falta MONGODB_URI en .env");
  process.exit(1);
}

await connectDB(MONGODB_URI);
await ensureAdminUser();

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
