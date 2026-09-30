import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface FinanceLedgerEntry {
  uuid: string;
  status: "completed";
  type: "buy" | "sell";
  coin: string;
  amount: number;
  receive: number;
  createdAt: string;
  updatedAt: string;
  recordedAt: string;
}

const defaultPath = resolve(process.cwd(), "data/finance-ledger.json");

function pathFromEnv(): string {
  return process.env.FINANCE_LEDGER_PATH ? resolve(process.env.FINANCE_LEDGER_PATH) : defaultPath;
}

export class FinanceLedgerStore {
  private entries = new Map<string, FinanceLedgerEntry>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const raw = await readFile(pathFromEnv(), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (this.isEntry(item)) this.entries.set(item.uuid, item);
        }
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code !== "ENOENT") throw error;
    }
  }

  async upsert(offers: unknown[]): Promise<number> {
    await this.initialize();
    let changed = 0;
    for (const offer of offers) {
      const entry = this.normalize(offer);
      if (!entry) continue;
      const previous = this.entries.get(entry.uuid);
      if (previous) {
        entry.recordedAt = previous.recordedAt;
      }
      if (!previous || JSON.stringify(previous) !== JSON.stringify(entry)) {
        this.entries.set(entry.uuid, entry);
        changed++;
      }
    }
    if (changed) await this.persist();
    return changed;
  }

  list(): FinanceLedgerEntry[] {
    return [...this.entries.values()].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  }

  private normalize(value: unknown): FinanceLedgerEntry | null {
    if (!value || typeof value !== "object") return null;
    const o = value as Record<string, unknown>;
    const uuid = String(o.uuid ?? o.id ?? "");
    const status = String(o.status ?? "").toLowerCase();
    const type = String(o.type ?? "").toLowerCase();
    const amount = Number(o.amount);
    const receive = Number(o.receive);
    if (!uuid || status !== "completed" || (type !== "buy" && type !== "sell") ||
        !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(receive) || receive < 0) return null;

    const createdAt = String(o.created_at ?? o.createdAt ?? o.updated_at ?? o.updatedAt ?? new Date(0).toISOString());
    const updatedAt = String(o.updated_at ?? o.updatedAt ?? createdAt);
    return {
      uuid, status: "completed", type, coin: String(o.coin ?? "QUSD"),
      amount, receive, createdAt, updatedAt, recordedAt: new Date().toISOString()
    };
  }

  private async persist(): Promise<void> {
    const path = pathFromEnv();
    await mkdir(dirname(path), { recursive: true });
    const temp = path + ".tmp";
    await writeFile(temp, JSON.stringify(this.list(), null, 2), "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(temp, path);
  }

  private isEntry(value: unknown): value is FinanceLedgerEntry {
    if (!value || typeof value !== "object") return false;
    const o = value as Record<string, unknown>;
    return typeof o.uuid === "string" && o.status === "completed" &&
      (o.type === "buy" || o.type === "sell") && typeof o.coin === "string" &&
      Number.isFinite(Number(o.amount)) && Number(o.amount) > 0 &&
      Number.isFinite(Number(o.receive)) && Number(o.receive) >= 0 &&
      typeof o.createdAt === "string" && typeof o.updatedAt === "string";
  }
}
