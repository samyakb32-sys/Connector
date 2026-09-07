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
- **Interact**: click, fill fields, submit forms, wait for elements, scroll
  (`click`, `fill_field`, `submit_form`, `wait_for_selector`, `scroll`).
- **Live-edit the DOM**: change text/HTML of elements, set/remove attributes,
  remove elements (`edit_element`, `set_attribute`, `remove_element`).
- **Escape hatch**: run arbitrary JavaScript in the page (`execute_js`) —
  call the site's own JS/APIs, mutate anything, fetch data the same way the
  site's own frontend does.

## Setup

```bash
npm install
npx playwright install chromium   # downloads the browser binary
npm run build
```

## Web dashboard (the "face")

A local UI to drive the same browser sessions by hand — enter a URL, see a
live screenshot, fetch/edit content, click/fill fields, run JS, or log in —
without going through an AI client at all.

```bash
npm run build
npm run web            # http://localhost:5177
```

Set `PORT` to change the port. The dashboard and the MCP server share the
same session store (`.sessions/`), so a session you log into from one can be
reused from the other by session id.

## Running as an MCP server

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

## Session model

Every tool takes a `session_id` (defaults to `"default"`). Calls sharing a
`session_id` reuse the same browser tab/cookies, so you can `navigate` → `login`
→ `fetch_content` → `edit_element` as one continuous flow. Cookies/local
storage are saved to `.sessions/<session_id>.json` after `login` or
`save_session`, so a session can be resumed after the process restarts.

## Notes on "editing"

`edit_element` / `set_attribute` / `execute_js` change the **live DOM in the
browser tab**, the same way browser DevTools would. This does not, by
itself, persist changes back to the website's server — for that, use
`execute_js` or `submit_form` to drive the site's own save/submit UI (form
POST, "Save" button, etc.), the same way a human user would.

## Security

- Credentials passed to `login` are only used in-memory to fill a form; they
  are never written to disk. What *is* persisted are the resulting session
  cookies (`.sessions/*.json`), which are as sensitive as the login itself —
  keep that directory out of version control (already in `.gitignore`) and
  restrict filesystem access to it.
- `execute_js` runs with full page privileges — treat it like a browser
  console, not a sandbox.
