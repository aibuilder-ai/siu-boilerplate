import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  // Add your bindings here (D1, KV, etc.)
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/", (c) => c.json({ message: "Hello from {{projectName}} API!" }));

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
