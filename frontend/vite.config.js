import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      // Keep local API requests on the backend's development server.
      "/api": "http://localhost:8000",
    },
  },
});
