/**
 * Single source of truth for "are we running mock?".
 *
 * Auto-detect default:
 *   - If MOCK_MODE is set explicitly, honor it.
 *   - Else if no real provider keys (Higgsfield/OpenAI), fall back to mock.
 *   - Else run real.
 *
 * This means a teammate who has not configured any keys yet still gets a
 * functional backend (mock); a teammate with keys gets the real one. No
 * surprises in either direction.
 */
function autoDefault(): boolean {
  const hasHiggsfield = Boolean(process.env.HIGGSFIELD_API_KEY);
  const hasKling = Boolean(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasCloudinary = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
  // Need at least one generation key AND OpenAI to run "real" meaningfully.
  return !((hasHiggsfield || hasKling) && hasOpenAI && hasCloudinary);
}

export function isMockMode(): boolean {
  const raw = process.env.MOCK_MODE;
  if (raw == null) return autoDefault();
  return raw.trim().toLowerCase() === "true";
}

export function logMockBanner() {
  if (!isMockMode()) return;
  console.log(
    [
      "",
      "  ╔══════════════════════════════════════════════════════════╗",
      "  ║  SceneOS backend is running in MOCK MODE.                ║",
      "  ║  All endpoints respond with realistic canned data.       ║",
      "  ║  Set MOCK_MODE=false in .env to use real providers.      ║",
      "  ╚══════════════════════════════════════════════════════════╝",
      "",
    ].join("\n"),
  );
}
