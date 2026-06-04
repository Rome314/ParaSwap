import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy Uniswap Routing API to avoid CORS in dev.
      // In production (Docker/Vercel) point VITE_UNISWAP_ROUTING_API_URL at a
      // server-side proxy or deploy behind a CORS-friendly reverse proxy.
      "/api/uniswap-quote": {
        target: "https://api.uniswap.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/uniswap-quote/, "/v2/quote"),
      },
    },
  },
});
