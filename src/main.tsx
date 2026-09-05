import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/sora/wght.css";
import "./styles/app.css";

async function start() {
  // Only the hosted interface preview sets VITE_PREVIEW_DEMO; Vite inlines the
  // value, so this branch and the demo bundle are absent from `npm run build`.
  if (import.meta.env.VITE_PREVIEW_DEMO === "1") {
    const { installDemoBackend } = await import("./lib/demo-backend");
    installDemoBackend();
  }
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
}

void start();
