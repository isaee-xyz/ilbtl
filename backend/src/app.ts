import express, { type Request, type Response } from "express";
import cors from "cors";
import { isDbInitialized } from "./config/firebase.js";
import { ensureDatabase } from "./middleware/database.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import apiRoutes from "./routes/index.js";

function parseAllowedOrigins(): string[] | undefined {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";
  const allowedOrigins = parseAllowedOrigins();

  if (isProduction) {
    app.set("trust proxy", process.env.TRUST_PROXY !== "false");
    app.disable("x-powered-by");
  }

  if (isProduction && allowedOrigins?.length) {
    app.use(
      cors({
        origin: allowedOrigins,
        credentials: true,
      }),
    );
  } else if (!isProduction) {
    app.use(cors());
  }

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  const healthCheck = (_req: Request, res: Response) => {
    if (!isDbInitialized()) {
      return res.status(503).json({
        ok: false,
        db: "disconnected",
      });
    }
    return res.json({ ok: true, db: "connected" });
  };

  app.get("/health", healthCheck);
  app.get("/api/health", healthCheck);

  app.use(ensureDatabase);
  app.use("/api", apiRoutes);
  app.use(errorHandler);

  return app;
}
