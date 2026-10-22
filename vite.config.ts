/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const preview = process.env.VITE_PREVIEW === "1"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The design preview is published as one self-contained page.
  ...(preview ? { base: "./", build: { outDir: "dist-preview", rollupOptions: { output: { inlineDynamicImports: true } } } } : {}),
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
})
