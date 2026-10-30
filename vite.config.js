import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Three pages: the public website (index.html), the privacy policy, and the app (app.html)
export default defineConfig({
  plugins: [react()],
  publicDir: "static",
  build: {
    rollupOptions: {
      input: { main: "index.html", privacy: "privacy.html", app: "app.html" },
    },
  },
});
