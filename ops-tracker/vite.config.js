import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
  build: {
    // The 3D intro's three.js chunk (~670 kB, ~170 kB gzipped) is loaded on demand only.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      // intro.html is the standalone (non-React) intro example.
      input: { main: "index.html", intro: "intro.html" },
    },
  },
  preview: { port: 5181 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
  },
});
