import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import indexRoutes from "./src/routes/index.routes.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

app.use("/api", indexRoutes);
app.use(errorHandler);

export default app;
