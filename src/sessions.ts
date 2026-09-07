import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SESSIONS_DIR = join(process.cwd(), ".sessions");
if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

interface Session {
  id: string;
  context: BrowserContext;
  page: Page;
}

class SessionManager {
  private browser: Browser | null = null;
  private sessions = new Map<string, Session>();

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  private storageStatePath(id: string): string {
    return join(SESSIONS_DIR, `${id}.json`);
  }

  async getOrCreate(id: string): Promise<Session> {
    const existing = this.sessions.get(id);
    if (existing) return existing;

    const browser = await this.getBrowser();
    const statePath = this.storageStatePath(id);
    const context = await browser.newContext({
      storageState: existsSync(statePath) ? statePath : undefined,
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    });
    const page = await context.newPage();
    const session: Session = { id, context, page };
    this.sessions.set(id, session);
    return session;
  }

  async saveState(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown session: ${id}`);
    await session.context.storageState({ path: this.storageStatePath(id) });
  }

  async close(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    await session.context.close();
    this.sessions.delete(id);
  }

  async closeAll(): Promise<void> {
    for (const id of this.sessions.keys()) {
      await this.close(id);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const sessionManager = new SessionManager();
