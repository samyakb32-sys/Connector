# Universal Website Connector

An MCP (Model Context Protocol) server that lets an AI **fetch data from, and
live-edit content on, any website** — public or behind a login — via a real
browser (Playwright/Chromium). Where most connectors only talk to one
specific service's API, this one drives an actual browser, so it works on
sites that have no API at all.

## What it can do

- **Navigate & inspect** any URL (`navigate`, `get_page_info`).
- **Fetch data**: page text/HTML by CSS selector, links, HTML tables,
  screenshots (`fetch_content`, `fetch_links`, `fetch_table`, `screenshot`).
- **Log in** to sites with a username/password form, and persist the session
  (cookies + storage) to disk under a `session_id` so it survives restarts
  (`login`, `set_cookies`, `save_session`).
- **Interact**: click elements and fill fields (`click`, `fill_field`).
- **Live-edit the DOM**: change text/HTML of elements, set/remove attributes,
  remove elements (`edit_element`, `set_attribute`, `remove_element`).
- **Escape hatch**: run arbitrary JavaScript in the page (`execute_js`) —
  call the site's own JS/APIs, mutate anything, fetch data the same way the
  site's own frontend does.

## For AI coding agents (Claude Code, Cursor, etc.)

If you're an agent with terminal access, you can set this up and use it
yourself — no deployment needed:

```bash
git clone -b main <this-repo-url>
cd Connector
npm install
npx playwright install chromium
npm run build
```

Then run `node dist/index.js` as an MCP server over stdio (add it to your own
MCP client config, or spawn it directly and speak the MCP protocol over its
stdin/stdout). All 16 tools are available immediately — see
[All tools](#all-tools) below. Each tool call takes a `session_id`; reuse the
same one across calls in a task to keep the browser tab, cookies, and login
state alive between `navigate` → `login` → `fetch_content` → `edit_element`
steps.

## Setup

```bash
npm install
npx playwright install chromium   # downloads the browser binary
npm run build
```

If your environment blocks the Playwright CDN (some sandboxed/CI setups do),
point the server at a pre-installed Chromium binary instead of downloading
one — see [Environment variables](#environment-variables) below.

## Running as an MCP server

There are two ways to run this, depending on how you want to connect it.

### Option A — Local (stdio), added to a config file

Add it to your MCP client config (Claude Desktop / Claude Code, etc.):

```json
{
  "mcpServers": {
    "universal-website-connector": {
      "command": "node",
      "args": ["/absolute/path/to/Connector/dist/index.js"]
    }
  }
}
```

### Option B — Remote (HTTP), added as a Claude "custom connector" by URL

This is the "paste a URL and go" experience, like Claude's built-in
connectors. It requires deploying the server somewhere with a public URL
(Playwright needs a real, always-on process — this can't run on static/
serverless-only hosting).

1. Deploy the included `Dockerfile` to any container host that runs
   long-lived processes (Railway, Render, Fly.io, a VPS, etc.). Set an
   environment variable `CONNECTOR_TOKEN` to a random secret — this
   protects the `/mcp` endpoint, since it will be publicly reachable.
2. In Claude, go to **Settings → Connectors → Add custom connector**, and
   enter `https://<your-deployed-host>/mcp` with an
   `Authorization: Bearer <your CONNECTOR_TOKEN>` header.

   If your MCP client can't send custom headers, the token can go in the URL
   instead — `https://<your-deployed-host>/mcp/<your CONNECTOR_TOKEN>` — so
   the connector is a single secret URL to paste. Treat that URL like a
   password.

Note that most container hosts have an ephemeral filesystem, so the saved
`.sessions/*.json` logins are lost on redeploy/restart; re-run `login` (or
`set_cookies`) after a deploy, or mount a persistent volume at
`/app/.sessions`.

Local testing before deploying:

```bash
npm run build
CONNECTOR_TOKEN=devsecret npm run start:http
# server listens on :3000 (override with PORT=...)
```

The HTTP server runs in stateless MCP mode (a fresh MCP session per
request); the underlying Playwright browser sessions are still tracked
per `session_id` independently of that, so `navigate` → `login` →
`fetch_content` flows work the same as over stdio.

## Environment variables

All optional — the server works with plain `npx playwright install` and no
special network setup by default.

| Variable | Purpose |
| --- | --- |
| `CHROMIUM_PATH` | Absolute path to a Chromium executable to use instead of the one Playwright would download (useful when the download is blocked). |
| `HTTPS_PROXY` / `https_proxy` | Proxy URL the launched browser should use for all navigation (e.g. `http://127.0.0.1:PORT`). |
| `ALLOW_INSECURE_TLS` | Set to `1` to ignore HTTPS certificate errors (`ignoreHTTPSErrors`). Off by default — only enable this for trusted, controlled environments (e.g. a local dev proxy with a self-signed cert), never for general browsing. |
| `PORT` | (HTTP mode only) Port for the HTTP server. Defaults to `3000`. |
| `CONNECTOR_TOKEN` | (HTTP mode only) Bearer token required on the `Authorization` header of every `/mcp` request. Strongly recommended once the server is publicly reachable — without it, anyone with the URL can drive the browser (including any `login`/credential calls). |

## Session model

Every tool takes a `session_id` (defaults to `"default"`). Calls sharing a
`session_id` reuse the same browser tab/cookies, so you can `navigate` → `login`
→ `fetch_content` → `edit_element` as one continuous flow. Cookies/local
storage are saved to `.sessions/<session_id>.json` after `login` or
`set_cookies`; for a login done by hand (multi-step, 2FA, OAuth) call
`save_session` to persist it, so the session can be resumed after a restart.
`close_session` frees a session's browser resources when you're done with it.

## All tools

| Tool | Purpose |
| --- | --- |
| `navigate` | Open a URL in a session. |
| `get_page_info` | Current URL + title. |
| `fetch_content` | Text/innerHTML/outerHTML of elements matching a selector. |
| `fetch_links` | All `text`/`href` pairs matching a selector. |
| `fetch_table` | Structured rows/cells from an HTML `<table>`. |
| `screenshot` | PNG screenshot of the page or one element. |
| `login` | Fill + submit a username/password form, persist cookies. |
| `set_cookies` | Inject cookies directly (e.g. tokens obtained elsewhere). |
| `save_session` | Persist current cookies/localStorage to disk. |
| `close_session` | Close a session and free its browser resources. |
| `click` | Click an element. |
| `fill_field` | Type into an input/textarea. |
| `edit_element` | Live-edit an element's text/HTML in the DOM. |
| `set_attribute` | Set or remove an HTML attribute. |
| `remove_element` | Remove element(s) from the page. |
| `execute_js` | Run arbitrary JavaScript in the page and return the result. |

Playwright auto-waits for elements and scrolls them into view, so there are
no separate wait/scroll tools; `execute_js` covers anything else.

## Testing

A smoke test that drives the server through the MCP client protocol against
a real page is included:

```bash
npm run build
node test/smoke.mjs
```

## Notes on "editing"

`edit_element` / `set_attribute` / `execute_js` change the **live DOM in the
browser tab**, the same way browser DevTools would. This does not, by
itself, persist changes back to the website's server — for that, use
`click` or `execute_js` to drive the site's own save/submit UI (a "Save"
button, a form POST, etc.), the same way a human user would.

## Security

- Credentials passed to `login` are only used in-memory to fill a form; they
  are never written to disk. What *is* persisted are the resulting session
  cookies (`.sessions/*.json`), which are as sensitive as the login itself —
  keep that directory out of version control (already in `.gitignore`) and
  restrict filesystem access to it.
- `execute_js` runs with full page privileges — treat it like a browser
  console, not a sandbox.
- `ALLOW_INSECURE_TLS` disables certificate verification for the browser;
  only use it in trusted, controlled network setups.
