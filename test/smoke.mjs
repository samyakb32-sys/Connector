import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: {
    ...process.env,
    CHROMIUM_PATH: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    ALLOW_INSECURE_TLS: "1",
  },
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

async function call(name, args) {
  console.log(`\n=== ${name}(${JSON.stringify(args)}) ===`);
  const res = await client.callTool({ name, arguments: args });
  for (const c of res.content) {
    if (c.type === "text") console.log(c.text.slice(0, 800));
    else console.log(`[${c.type}] length=${c.data?.length ?? "?"}`);
  }
  if (res.isError) console.log("!! isError true");
  return res;
}

await call("navigate", { session_id: "t1", url: "https://example.com" });
await call("get_page_info", { session_id: "t1" });
await call("fetch_content", { session_id: "t1", selector: "h1" });
await call("fetch_links", { session_id: "t1" });
await call("edit_element", { session_id: "t1", selector: "h1", text: "Edited by Universal Website Connector" });
await call("fetch_content", { session_id: "t1", selector: "h1" });
await call("set_attribute", { session_id: "t1", selector: "h1", attribute: "style", value: "color:red" });
const shot = await call("screenshot", { session_id: "t1" });

import { writeFileSync } from "node:fs";
const img = shot.content.find((c) => c.type === "image");
if (img) {
  writeFileSync("test/smoke-screenshot.png", Buffer.from(img.data, "base64"));
  console.log("Saved test/smoke-screenshot.png");
}

await call("execute_js", { session_id: "t1", script: "return document.title" });

await client.close();
process.exit(0);
