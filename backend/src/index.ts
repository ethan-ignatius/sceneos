import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { agentRoute } from "./routes/agent.js";
import { decomposeRoute } from "./routes/decompose.js";
import { generateRoute } from "./routes/generate.js";
import { statusRoute } from "./routes/status.js";
import { stitchRoute } from "./routes/stitch.js";
import { cutosRoute } from "./routes/cutos.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"],
    maxAge: 86_400,
  }),
);

app.get("/", (c) =>
  c.json({
    name: "sceneos-backend",
    status: "ok",
    docs: "see docs/BACKEND_ARCHITECTURE.md",
  }),
);

app.route("/api/agent", agentRoute);
app.route("/api/decompose", decomposeRoute);
app.route("/api/generate", generateRoute);
app.route("/api/status", statusRoute);
app.route("/api/stitch", stitchRoute);
app.route("/api/cutos", cutosRoute);

app.notFound((c) => c.json({ error: "Not Found" }, 404));
app.onError((err, c) => {
  console.error("[sceneos-backend] unhandled error", err);
  return c.json({ error: "Internal Server Error", details: err.message }, 500);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[sceneos-backend] listening on http://localhost:${info.port}`);
});

export default app;
