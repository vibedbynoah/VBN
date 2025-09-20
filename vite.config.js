import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    rollupOptions: {
      input: {
        home: "index.html",
        idea1: "ideas/idea1/index.html",
        idea2: "ideas/idea2/index.html"
      }
    },
    outDir: "dist"
  },
  server: { open: "/index.html" }
});
