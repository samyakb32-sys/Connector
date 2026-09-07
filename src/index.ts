#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { sessionManager } from "./sessions.js";

const server = new McpServer({
  name: "universal-website-connector",
  version: "1.0.0",
});

registerTools(server);

process.on("SIGINT", async () => {
  await sessionManager.closeAll();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await sessionManager.closeAll();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
