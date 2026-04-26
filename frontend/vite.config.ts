/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // 1700kB sits just above the canvas-only WebGL vendor chunk
    // (three.js + drei + postprocessing land around 1.6MB minified).
    // Tighter limits would just be noise; looser ones would mask a
    // genuine regression in the shipped app code.
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        // Three.js + R3F + drei are big and used by canvas-only routes
        // (canvas, crumple-bridge, landing's hero preload). Peeling them
        // into a single vendor chunk means they're cached across route
        // navigations and the main entry stays under the 500KB warning.
        // Other heavy deps grouped by usage profile.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // drei + postprocessing pull in their own helper graph
            // (postprocessing/effect-composer, troika-three-text fonts).
            // Keeping them in their own chunk means three core can be
            // cached on its own and re-used across routes.
            if (id.includes("@react-three/drei") || id.includes("@react-three/postprocessing")) {
              return "vendor-three-extras";
            }
            if (id.includes("@react-three/fiber") || id.includes("/three/")) {
              return "vendor-three";
            }
            if (id.includes("motion") || id.includes("framer-motion")) {
              return "vendor-motion";
            }
            if (id.includes("gsap") || id.includes("lenis")) {
              return "vendor-anim";
            }
            if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("sonner")) {
              return "vendor-ui";
            }
            if (id.includes("zustand") || id.includes("@tanstack")) {
              return "vendor-state";
            }
            if (id.includes("react") && !id.includes("@react-three")) {
              return "vendor-react";
            }
          }
        },
      },
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
  },
});
