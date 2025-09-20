import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ideasDir = resolve(__dirname, "ideas");

const ideaEntries = fs.existsSync(ideasDir)
  ? Object.fromEntries(
      fs.readdirSync(ideasDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(resolve(ideasDir, d.name, "index.html")))
        .map(d => [d.name, resolve(ideasDir, d.name, "index.html")])
    )
  : {};

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: { home: resolve(__dirname, "index.html"), ...ideaEntries }
    }
  },
  server: {
    host: true,
    open: false,
    allowedHosts: [".csb.app"],
    hmr: { clientPort: 443 }
  }
});
