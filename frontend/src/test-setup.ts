// Vitest runs in a Node environment by default (see vite.config.ts).
// Zustand's persist middleware reads `window.localStorage` at module
// load time — without `window`, persist throws inside `createJSONStorage`
// and warns on every set. Shim both `window` and `localStorage` so the
// store hydrates cleanly without a jsdom dependency.

const memoryMap = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return memoryMap.size;
  },
  clear: () => memoryMap.clear(),
  getItem: (key) => (memoryMap.has(key) ? (memoryMap.get(key) as string) : null),
  key: (i) => Array.from(memoryMap.keys())[i] ?? null,
  removeItem: (key) => {
    memoryMap.delete(key);
  },
  setItem: (key, value) => {
    memoryMap.set(key, value);
  },
};

const g = globalThis as unknown as {
  window?: { localStorage: Storage };
  localStorage?: Storage;
};
g.localStorage = memoryStorage;
if (!g.window) g.window = { localStorage: memoryStorage };
else g.window.localStorage = memoryStorage;
