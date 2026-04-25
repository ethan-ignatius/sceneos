import { Hono } from "hono";
import { z } from "zod";
import { signUpload } from "../services/cloudinary.js";

export const cloudinaryRoute = new Hono();

const SignRequestSchema = z.object({
  folder: z.string().min(1).max(120).optional(),
});

cloudinaryRoute.post("/sign", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SignRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  try {
    return c.json(signUpload(parsed.data.folder), 200);
  } catch (err) {
    return c.json(
      { error: "Cloudinary signing failed", details: (err as Error).message },
      500,
    );
  }
});
