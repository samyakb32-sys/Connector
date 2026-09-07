#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = Number(process.env.PORT) || 3000;
const TOKEN = process.env.CONNECTOR_TOKEN;

const app = express();
// Tool payloads (e.g. a large `html` blob for edit_element) can exceed the
// 100kb express default, so raise the JSON body limit.
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.json({ name: "universal-website-connector", status: "ok" });
});

/** Handle one stateless MCP request: fresh server + transport per call. */
async function handleMcp(req: Request, res: Response) {
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

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("MCP request failed:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  }
}

// Token in the Authorization header (preferred).
app.post("/mcp", async (req, res) => {
  if (TOKEN && req.get("authorization") !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  await handleMcp(req, res);
});

// Token embedded in the URL, for MCP clients that can't send custom headers —
// the whole endpoint is then a single secret URL to paste.
app.post("/mcp/:token", async (req, res) => {
  if (TOKEN && req.params.token !== TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  await handleMcp(req, res);
});

app.listen(PORT, () => {
  console.log(`universal-website-connector listening on :${PORT}`);
  if (!TOKEN) {
    console.warn("CONNECTOR_TOKEN not set — the /mcp endpoint is unauthenticated. Set CONNECTOR_TOKEN before exposing this publicly.");
  }
});
