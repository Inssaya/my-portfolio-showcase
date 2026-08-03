import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { allowedOrigins, env } from "./env.js";
import { errorHandler } from "./errors.js";
import authRoutes from "./auth/routes.js";
import adminRoutes from "./admin/index.js";
import publicRoutes from "./public/index.js";

const app = express();

app.set("trust proxy", 1); // Render sits behind a reverse proxy; needed for correct client IPs.
app.disable("x-powered-by");

// Baseline hardening — safe defaults; nothing here needs tuning for this app.
app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header (curl, health probes, server-to-server)
      // are allowed. Browser calls carry an Origin and are checked against the
      // explicit allow-list from env; anything else is refused rather than
      // echoed back.
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      return callback(new Error("origin_not_allowed"));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"],
  }),
);

app.use(express.json({ limit: "256kb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Health check — hit by Render's uptime probe and useful for a quick eyeball.
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use("/api", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req, res) => res.status(404).json({ error: "not_found" }));
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`Portfolio backend listening on :${env.PORT} (${env.NODE_ENV})`);
  if (allowedOrigins.length === 0) {
    console.warn("FRONTEND_ORIGIN is empty — no browser can call this API.");
  }
});

// Give in-flight requests a fair chance to finish when Render sends SIGTERM.
const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
