import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./src", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL("./src/index.html", import.meta.url)),
        session: fileURLToPath(
          new URL("./src/session/index.html", import.meta.url),
        ),
      },
    },
  },
});
