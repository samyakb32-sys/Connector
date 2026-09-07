import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionManager } from "./sessions.js";

const sessionIdSchema = z
  .string()
  .default("default")
  .describe("Logical browser session id. Reuse the same id to keep cookies/login across calls.");

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function registerTools(server: McpServer) {
  // --- Navigation & inspection -------------------------------------------------

  server.tool(
    "navigate",
    "Open a URL in a browser session (creates the session if it doesn't exist yet). Works on any public or already-logged-in website.",
    {
      session_id: sessionIdSchema,
      url: z.string().url(),
      wait_until: z.enum(["load", "domcontentloaded", "networkidle"]).optional().default("load"),
    },
    async ({ session_id, url, wait_until }) => {
      try {
        const { page } = await sessionManager.getOrCreate(session_id);
        const response = await page.goto(url, { waitUntil: wait_until });
        return ok(
          `Navigated to ${page.url()} (status ${response?.status() ?? "unknown"}, title: "${await page.title()}")`
        );
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Navigation failed: ${errText(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_page_info",
    "Get the current URL and title for a session.",
    { session_id: sessionIdSchema },
    async ({ session_id }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      return ok(`URL: ${page.url()}\nTitle: ${await page.title()}`);
    }
  );

  server.tool(
    "fetch_content",
    "Fetch text or HTML content from the current page, optionally scoped to a CSS selector. Use this to pull data out of any website.",
    {
      session_id: sessionIdSchema,
      selector: z.string().optional().describe("CSS selector to scope extraction. Omit for the whole page."),
      mode: z.enum(["text", "innerHtml", "outerHtml"]).default("text"),
    },
    async ({ session_id, selector, mode }) => {
      try {
        const { page } = await sessionManager.getOrCreate(session_id);
        const target = selector ?? "body";
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
        return ok(result || "(empty)");
      } catch (e) {
        return { content: [{ type: "text" as const, text: `fetch_content failed: ${errText(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "fetch_links",
    "Extract all links (text + href) matching a selector, useful for crawling or listing items on a page.",
    {
      session_id: sessionIdSchema,
      selector: z.string().default("a"),
    },
    async ({ session_id, selector }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      const links = await page.$$eval(selector, (els) =>
        els.map((el) => ({ text: (el as HTMLElement).innerText.trim(), href: (el as HTMLAnchorElement).href }))
      );
      return ok(JSON.stringify(links, null, 2));
    }
  );

  server.tool(
    "fetch_table",
    "Extract an HTML <table> into structured rows of cell text.",
    {
      session_id: sessionIdSchema,
      selector: z.string().default("table"),
    },
    async ({ session_id, selector }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      const rows = await page.$eval(selector, (table) =>
        Array.from((table as HTMLTableElement).rows).map((row) =>
          Array.from(row.cells).map((cell) => (cell as HTMLElement).innerText.trim())
        )
      );
      return ok(JSON.stringify(rows, null, 2));
    }
  );

  server.tool(
    "screenshot",
    "Take a screenshot of the current page or a specific element. Returns a base64 PNG image.",
    {
      session_id: sessionIdSchema,
      selector: z.string().optional(),
      full_page: z.boolean().optional().default(false),
    },
    async ({ session_id, selector, full_page }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      const buffer = selector
        ? await page.locator(selector).screenshot()
        : await page.screenshot({ fullPage: full_page });
      return {
        content: [{ type: "image" as const, data: buffer.toString("base64"), mimeType: "image/png" }],
      };
    }
  );

  // --- Authentication -----------------------------------------------------------

  server.tool(
    "login",
    "Log into a website by filling a username/password form and submitting it. Session cookies are persisted to disk under the same session_id so future calls (even after a restart) stay logged in.",
    {
      session_id: sessionIdSchema,
      url: z.string().url().optional().describe("Login page URL. Omit to use the current page."),
      username_selector: z.string(),
      password_selector: z.string(),
      submit_selector: z.string(),
      username: z.string(),
      password: z.string(),
      wait_after_ms: z.number().optional().default(1500),
    },
    async ({ session_id, url, username_selector, password_selector, submit_selector, username, password, wait_after_ms }) => {
      try {
        const { page } = await sessionManager.getOrCreate(session_id);
        if (url) await page.goto(url, { waitUntil: "load" });
        await page.fill(username_selector, username);
        await page.fill(password_selector, password);
        await Promise.all([
          page.click(submit_selector),
          page.waitForLoadState("load").catch(() => {}),
        ]);
        await page.waitForTimeout(wait_after_ms);
        await sessionManager.saveState(session_id);
        return ok(`Login flow submitted. Current URL: ${page.url()}. Session cookies saved for session "${session_id}".`);
      } catch (e) {
        return { content: [{ type: "text" as const, text: `login failed: ${errText(e)}` }], isError: true };
      }
    }
  );

  server.tool(
    "set_cookies",
    "Manually inject cookies into a session (e.g. tokens obtained elsewhere) instead of a form login.",
    {
      session_id: sessionIdSchema,
      cookies: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          domain: z.string(),
          path: z.string().default("/"),
          secure: z.boolean().optional(),
          httpOnly: z.boolean().optional(),
        })
      ),
    },
    async ({ session_id, cookies }) => {
      const { context } = await sessionManager.getOrCreate(session_id);
      await context.addCookies(cookies as any);
      await sessionManager.saveState(session_id);
      return ok(`Injected ${cookies.length} cookie(s) and saved session state.`);
    }
  );

  server.tool(
    "close_session",
    "Close a browser session and free resources.",
    { session_id: sessionIdSchema },
    async ({ session_id }) => {
      await sessionManager.close(session_id);
      return ok(`Session "${session_id}" closed.`);
    }
  );

  // --- Interaction ---------------------------------------------------------------

  server.tool(
    "click",
    "Click an element matching a CSS selector.",
    { session_id: sessionIdSchema, selector: z.string() },
    async ({ session_id, selector }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      await page.click(selector, { timeout: 10000 });
      return ok(`Clicked "${selector}"`);
    }
  );

  server.tool(
    "fill_field",
    "Type a value into an input/textarea matching a CSS selector.",
    { session_id: sessionIdSchema, selector: z.string(), value: z.string() },
    async ({ session_id, selector, value }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      await page.fill(selector, value, { timeout: 10000 });
      return ok(`Filled "${selector}" with the given value.`);
    }
  );

  // --- Live editing (the part other connectors don't do) -------------------------

  server.tool(
    "edit_element",
    "Live-edit an element's text or HTML content on the currently loaded page (DOM edit, like using DevTools). Great for correcting text, replacing content, or testing changes visually before they're saved anywhere permanent.",
    {
      session_id: sessionIdSchema,
      selector: z.string(),
      text: z.string().optional().describe("Set as textContent. Mutually exclusive with html."),
      html: z.string().optional().describe("Set as innerHTML. Mutually exclusive with text."),
      all_matches: z.boolean().optional().default(false).describe("Apply to every element matching the selector, not just the first."),
    },
    async ({ session_id, selector, text, html, all_matches }) => {
      if (text === undefined && html === undefined) {
        return { content: [{ type: "text" as const, text: "Provide either text or html." }], isError: true };
      }
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
      return ok(`Edited ${count} element(s) matching "${selector}".`);
    }
  );

  server.tool(
    "set_attribute",
    "Set (or remove) an HTML attribute on matching elements, e.g. changing a link's href, an image's src, or a class.",
    {
      session_id: sessionIdSchema,
      selector: z.string(),
      attribute: z.string(),
      value: z.string().nullable().describe("Pass null to remove the attribute."),
      all_matches: z.boolean().optional().default(false),
    },
    async ({ session_id, selector, attribute, value, all_matches }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      const count = await page.$$eval(
        selector,
        (els, { attribute, value, all }) => {
          const targets = all ? els : els.slice(0, 1);
          for (const el of targets) {
            if (value === null) el.removeAttribute(attribute);
            else el.setAttribute(attribute, value);
          }
          return targets.length;
        },
        { attribute, value, all: all_matches }
      );
      return ok(`Updated attribute "${attribute}" on ${count} element(s).`);
    }
  );

  server.tool(
    "remove_element",
    "Remove element(s) matching a CSS selector from the page (e.g. strip ads, popups, or unwanted sections before reading content).",
    { session_id: sessionIdSchema, selector: z.string(), all_matches: z.boolean().optional().default(true) },
    async ({ session_id, selector, all_matches }) => {
      const { page } = await sessionManager.getOrCreate(session_id);
      const count = await page.$$eval(
        selector,
        (els, all) => {
          const targets = all ? els : els.slice(0, 1);
          for (const el of targets) el.remove();
          return targets.length;
        },
        all_matches
      );
      return ok(`Removed ${count} element(s).`);
    }
  );

  server.tool(
    "execute_js",
    "Run arbitrary JavaScript in the page context and return its (JSON-serializable) result. The most powerful escape hatch: fetch data, mutate the DOM, call the site's own JS functions/APIs, whatever a normal user's browser console could do.",
    { session_id: sessionIdSchema, script: z.string().describe("JS expression or function body; evaluated with `new Function(script)`.") },
    async ({ session_id, script }) => {
      try {
        const { page } = await sessionManager.getOrCreate(session_id);
        const result = await page.evaluate((src) => {
          // eslint-disable-next-line no-new-func
          const fn = new Function(src);
          return fn();
        }, script);
        return ok(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      } catch (e) {
        return { content: [{ type: "text" as const, text: `execute_js failed: ${errText(e)}` }], isError: true };
      }
    }
  );
}
