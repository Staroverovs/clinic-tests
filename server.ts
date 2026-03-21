import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// MUST use 3000 as fallback for AI Studio preview
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start listening IMMEDIATELY before any async operations
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is listening on 0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

async function setupServer() {
  const distPath = path.resolve(__dirname, "dist");
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && fs.existsSync(distPath)) {
    console.log("Serving production build from dist/");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    console.log("Starting Vite middleware in development mode...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
}

setupServer().catch(err => {
  console.error("Failed to setup server:", err);
});
