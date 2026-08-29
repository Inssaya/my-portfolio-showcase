import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two entry points. /p/* is served portfolio.html instead of index.html
      // — see the comment in that file: index.html is 660 lines of Yassine's
      // own SEO, and serving it for a stranger's published portfolio put his
      // name and face on their share card and told search engines the page
      // was about him.
      input: {
        main: path.resolve(__dirname, "index.html"),
        portfolio: path.resolve(__dirname, "portfolio.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
