#!/usr/bin/env node
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";
import { sessionManager } from "./sessions.js";

const PORT = Number(process.env.PORT) || 3000;
const TOKEN = process.env.CONNECTOR_TOKEN;

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "universal-website-connector", status: "ok" });
});

app.post("/mcp", async (req, res) => {
  if (TOKEN) {
    const auth = req.get("authorization");
    if (auth !== `Bearer ${TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  // Stateless mode: a fresh MCP server + transport per request, so a Claude
  // connector can just POST here without a session handshake. The Playwright
  // browser sessions themselves are still tracked by session_id in sessionManager,
  // independent of this per-request MCP transport.
  const server = new McpServer({ name: "universal-website-connector", version: "1.0.0" });
  registerTools(server);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "method_not_allowed", message: "This server runs in stateless mode; POST to /mcp." });
});

app.listen(PORT, () => {
  console.log(`universal-website-connector listening on :${PORT}`);
  if (!TOKEN) {
    console.warn("CONNECTOR_TOKEN not set — the /mcp endpoint is unauthenticated. Set CONNECTOR_TOKEN before exposing this publicly.");
  }
});

process.on("SIGINT", async () => {
  await sessionManager.closeAll();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await sessionManager.closeAll();
  process.exit(0);
});
