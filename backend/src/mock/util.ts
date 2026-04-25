/** Tiny helpers used across mock modules. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function deterministicJobId(prefix: string, seed: string): string {
  // Hashing not needed — mock IDs just need to be unique-ish per scene.
  return `${prefix}::${seed}-${Date.now().toString(36)}`;
}
