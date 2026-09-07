#!/usr/bin/env node
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sessionManager } from "../sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "..", "public")));

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function screenshotDataUrl(sessionId: string): Promise<string | null> {
  try {
    const { page } = await sessionManager.getOrCreate(sessionId);
    const buffer = await page.screenshot();
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function pageState(sessionId: string) {
  const { page } = await sessionManager.getOrCreate(sessionId);
  return { url: page.url(), title: await page.title() };
}

app.get("/api/state", async (req, res) => {
  const sessionId = String(req.query.session_id ?? "dashboard");
  try {
    const state = await pageState(sessionId);
    const screenshot = await screenshotDataUrl(sessionId);
    res.json({ ...state, screenshot });
  } catch (e) {
    res.status(500).json({ error: errText(e) });
  }
});

app.post("/api/navigate", async (req, res) => {
  const { session_id = "dashboard", url } = req.body ?? {};
  try {
    const { page } = await sessionManager.getOrCreate(session_id);
    const response = await page.goto(url, { waitUntil: "load" });
    res.json({
      url: page.url(),
      title: await page.title(),
      status: response?.status() ?? null,
      screenshot: await screenshotDataUrl(session_id),
    });
  } catch (e) {
    res.status(400).json({ error: errText(e) });
  }
});

app.post("/api/fetch", async (req, res) => {
  const { session_id = "dashboard", selector, mode = "text" } = req.body ?? {};
  try {
    const { page } = await sessionManager.getOrCreate(session_id);
    const target = selector || "body";
    await page.waitForSelector(target, { timeout: 10000 });
    const result = await page.$$eval(
      target,
      (els, mode) =>
        els
          .map((el) =>
            mode === "text" ? (el as HTMLElement).innerText : mode === "innerHtml" ? el.innerHTML : el.outerHTML
          )
          .join("\n\n---\n\n"),
      mode
    );
    res.json({ result });
  } catch (e) {
    res.status(400).json({ error: errText(e) });
  }
});

app.post("/api/click", async (req, res) => {
  const { session_id = "dashboard", selector } = req.body ?? {};
  try {
    const { page } = await sessionManager.getOrCreate(session_id);
    await page.click(selector, { timeout: 10000 });
    res.json({ ...(await pageState(session_id)), screenshot: await screenshotDataUrl(session_id) });
  } catch (e) {
    res.status(400).json({ error: errText(e) });
  }
});

app.post("/api/fill", async (req, res) => {
  const { session_id = "dashboard", selector, value } = req.body ?? {};
  try {
    const { page } = await sessionManager.getOrCreate(session_id);
    await page.fill(selector, value, { timeout: 10000 });
    res.json({ screenshot: await screenshotDataUrl(session_id) });
  } catch (e) {
    res.status(400).json({ error: errText(e) });
  }
});

app.post("/api/edit", async (req, res) => {
  const { session_id = "dashboard", selector, text, html, all_matches = false } = req.body ?? {};
  if (text === undefined && html === undefined) {
    return res.status(400).json({ error: "Provide either text or html." });
  }
  try {
    const { page } = await sessionManager.getOrCreate(session_id);
    const count = await page.$$eval(
      selector,
      (els, { text, html, all }) => {
        const targets = all ? els : els.slice(0, 1);
        for (const el of targets) {
          if (text !== undefined) (el as HTMLElement).innerText = text;
          if (html !== undefined) el.innerHTML = html;
        }
        return targets.length;
      },
      { text, html, all: all_matches }
    );
    res.json({ count, screenshot: await screenshotDataUrl(session_id) });
  } catch (e) {
    res.status(400).json({ error: errText(e) });
  }
});

app.post("/api/js", async (req, res) => {
  const { session_id = "dashboard", script } = req.body ?? {};
  try {
    const { page } = await sessionManager.getOrCreate(session_id);
    const result = await page.evaluate((src) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(src);
      return fn();
    }, script);
    res.json({ result, screenshot: await screenshotDataUrl(session_id) });
  } catch (e) {
    res.status(400).json({ error: errText(e) });
  }
});

app.post("/api/login", async (req, res) => {
  const {
    session_id = "dashboard",
    url,
    username_selector,
    password_selector,
    submit_selector,
    username,
    password,
  } = req.body ?? {};
  try {
    const { page } = await sessionManager.getOrCreate(session_id);
    if (url) await page.goto(url, { waitUntil: "load" });
    await page.fill(username_selector, username);
    await page.fill(password_selector, password);
    await Promise.all([page.click(submit_selector), page.waitForLoadState("load").catch(() => {})]);
    await page.waitForTimeout(1500);
    await sessionManager.saveState(session_id);
    res.json({ ...(await pageState(session_id)), screenshot: await screenshotDataUrl(session_id) });
  } catch (e) {
    res.status(400).json({ error: errText(e) });
  }
});

app.post("/api/close", async (req, res) => {
  const { session_id = "dashboard" } = req.body ?? {};
  await sessionManager.close(session_id);
  res.json({ closed: true });
});

const port = Number(process.env.PORT) || 5177;
app.listen(port, () => {
  console.log(`Universal Website Connector dashboard: http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  await sessionManager.closeAll();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await sessionManager.closeAll();
  process.exit(0);
});
