import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        home: resolve(__dirname, "index.html"),
        idea1: resolve(__dirname, "ideas/idea1/index.html"),
        idea2: resolve(__dirname, "ideas/idea2/index.html")
      }
    }
  },
  server: { open: "/index.html" }
});
