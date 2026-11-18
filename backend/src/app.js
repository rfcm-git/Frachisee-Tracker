/* The Express app. It does not listen here, so tests and serverless hosts can import it. */
import cors from "cors";
import express from "express";
import { ApiError, errorBody } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { settingsRouter } from "./routes/settings.js";
import { tablesRouter } from "./routes/tables.js";

/**
 * db: a Supabase client (or anything with the same .from() query API).
 * config: see config.js.
 */
export function createApp({ db, config }) {
  const app = express();
  app.disable("x-powered-by");

  const allowed = new Set(config.corsOrigins);
  app.use(cors({
    // Requests without an Origin (curl, server to server) are allowed; browsers only from the listed origins.
    origin: (origin, done) => done(null, !origin || allowed.has("*") || allowed.has(origin)),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
  }));
  app.use(express.json({ limit: config.jsonLimit }));

  // Is the API up, and can it reach the database?
  app.get("/api/health", async (_req, res) => {
    const { error } = await db.from("franchisees").select("id").limit(1);
    if (error) return res.status(503).json({ ok: false, database: false, ...errorBody({ message: error.message, code: error.code }) });
    res.json({ ok: true, database: true });
  });

  app.use("/api/auth", authRouter(config.adminPassword));
  app.use("/api/settings", settingsRouter(db));
  app.use("/api/tables", tablesRouter(db));

  app.use("/api", (req, _res, next) => next(new ApiError(404, `No endpoint ${req.method} ${req.originalUrl}`, { code: "NOT_FOUND" })));

  // Express recognises error handlers by their four arguments.
  app.use((error, _req, res, _next) => {
    const status = error.status || error.statusCode || 500;
    if (status >= 500) console.error(error);
    const body = status < 500 ? error : { message: "Internal server error", code: "INTERNAL" };
    res.status(status).json(errorBody(body));
  });

  return app;
}
