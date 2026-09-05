import fs from "node:fs";
import process from "node:process";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const { app, currentProvider, repository } = createApp({ config });
const server = app.listen(config.PORT, "127.0.0.1", () => {
  console.log(`Receipt Relay API listening on http://127.0.0.1:${config.PORT} (${currentProvider().provider.name})`);
});

function shutdown() {
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
