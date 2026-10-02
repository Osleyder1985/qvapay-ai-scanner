/**
 * @file finance-ledger.ts
 * @path src/backend/finance-ledger.ts
 * @description Implementa el ledger financiero de QvaPay AI Scanner.
 * @module backend
 * @status active
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**

 * interface FinanceLedgerEntry público utilizado por el módulo.

 */

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
  grossAmountQusd: number;
  feeQusd: number | null;
  netAmountQusd: number | null;
  feeSource: "qvapay_received" | "unknown";
}

const defaultPath = resolve(process.cwd(), "data/finance-ledger.json");

/**
 * Implementa la operación pathFromEnv de este módulo.

 * @returns Resultado de la operación.
 */
function pathFromEnv(): string {
  return process.env.FINANCE_LEDGER_PATH
    ? resolve(process.env.FINANCE_LEDGER_PATH)
    : defaultPath;
}

/**

 * class FinanceLedgerStore público utilizado por el módulo.

 */

export class FinanceLedgerStore {
  private entries = new Map<string, FinanceLedgerEntry>();
  private initialized = false;

  /**
   * Ejecuta el método initialize y preserva las invariantes documentadas del módulo.

   * @returns Promise<void> devuelto por el método.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const raw = await readFile(pathFromEnv(), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (this.isEntry(item))
            this.entries.set(item.uuid, this.normalizeLoaded(item));
        }
      }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code !== "ENOENT") throw error;
    }
  }

  /**
   * Ejecuta el método upsert y preserva las invariantes documentadas del módulo.
   * @param offers Entrada utilizada por la method.
   * @returns Promise<number> devuelto por el método.
   */
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
      if (previous) {
        entry.grossAmountQusd = previous.grossAmountQusd;
        entry.feeQusd = previous.feeQusd;
        entry.netAmountQusd = previous.netAmountQusd;
        entry.feeSource = previous.feeSource;
      }
      if (!previous || JSON.stringify(previous) !== JSON.stringify(entry)) {
        this.entries.set(entry.uuid, entry);
        changed++;
      }
    }
    if (changed) await this.persist();
    return changed;
  }

  /**
   * Ejecuta el método recordSettlement y preserva las invariantes documentadas del módulo.
   * @param uuid Entrada utilizada por la method.
   * @param settlement Entrada utilizada por la method.
   * @returns Promise<boolean> devuelto por el método.
   */
  async recordSettlement(uuid: string, settlement: unknown): Promise<boolean> {
    await this.initialize();
    const entry = this.entries.get(uuid);
    if (!entry || !settlement || typeof settlement !== "object") return false;
    const value = settlement as Record<string, unknown>;
    const fee = Number(value.fee);
    const gross = Number(value.gross_amount);
    const net = Number(value.amount);
    if (
      !Number.isFinite(fee) ||
      fee < 0 ||
      !Number.isFinite(gross) ||
      gross < 0 ||
      !Number.isFinite(net) ||
      net < 0
    )
      return false;
    const settlementTolerance = Math.max(Math.abs(gross), 1) * 1e-9;
    if (fee > gross + settlementTolerance || net > gross + settlementTolerance)
      return false;
    if (Math.abs(gross - (net + fee)) > settlementTolerance) return false;
    const next = {
      ...entry,
      grossAmountQusd: gross,
      feeQusd: fee,
      netAmountQusd: net,
      feeSource: "qvapay_received" as const,
    };
    if (JSON.stringify(next) === JSON.stringify(entry)) return false;
    this.entries.set(uuid, next);
    await this.persist();
    return true;
  }

  /**
   * Ejecuta el método list y preserva las invariantes documentadas del módulo.

   * @returns FinanceLedgerEntry[] devuelto por el método.
   */
  list(): FinanceLedgerEntry[] {
    return [...this.entries.values()].sort(
      (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
    );
  }

  private normalizeLoaded(value: FinanceLedgerEntry): FinanceLedgerEntry {
    const gross = Number(value.grossAmountQusd);
    const fee = value.feeQusd === null ? null : Number(value.feeQusd);
    const net =
      value.netAmountQusd === null ? null : Number(value.netAmountQusd);
    const settlementTolerance = Math.max(Math.abs(gross), 1) * 1e-9;
    const settlementValid =
      Number.isFinite(gross) &&
      gross >= 0 &&
      (fee === null || (Number.isFinite(fee) && fee >= 0)) &&
      (net === null || (Number.isFinite(net) && net >= 0)) &&
      ((fee === null && net === null) ||
        (fee !== null &&
          net !== null &&
          fee <= gross + settlementTolerance &&
          net <= gross + settlementTolerance &&
          Math.abs(gross - (net + fee)) <= settlementTolerance));

    if (!settlementValid) {
      return {
        ...value,
        grossAmountQusd: value.amount,
        feeQusd: null,
        netAmountQusd: null,
        feeSource: "unknown",
      };
    }

    return {
      ...value,
      grossAmountQusd: gross,
      feeQusd: fee,
      netAmountQusd: net,
      feeSource:
        fee !== null && net !== null && value.feeSource === "qvapay_received"
          ? "qvapay_received"
          : "unknown",
    };
  }

  private normalize(value: unknown): FinanceLedgerEntry | null {
    if (!value || typeof value !== "object") return null;
    const o = value as Record<string, unknown>;
    const uuid = String(o.uuid ?? o.id ?? "");
    const status = String(o.status ?? "").toLowerCase();
    const type = String(o.type ?? "").toLowerCase();
    const amount = Number(o.amount);
    const receive = Number(o.receive);
    if (
      !uuid ||
      status !== "completed" ||
      (type !== "buy" && type !== "sell") ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(receive) ||
      receive < 0
    )
      return null;

    const createdAt = String(
      o.created_at ??
        o.createdAt ??
        o.updated_at ??
        o.updatedAt ??
        new Date(0).toISOString(),
    );
    const updatedAt = String(o.updated_at ?? o.updatedAt ?? createdAt);
    return {
      uuid,
      status: "completed",
      type,
      coin: String(o.coin ?? "QUSD"),
      amount,
      receive,
      createdAt,
      updatedAt,
      recordedAt: new Date().toISOString(),
      grossAmountQusd: amount,
      feeQusd: null,
      netAmountQusd: null,
      feeSource: "unknown",
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
    return (
      typeof o.uuid === "string" &&
      o.status === "completed" &&
      (o.type === "buy" || o.type === "sell") &&
      typeof o.coin === "string" &&
      Number.isFinite(Number(o.amount)) &&
      Number(o.amount) > 0 &&
      Number.isFinite(Number(o.receive)) &&
      Number(o.receive) >= 0 &&
      typeof o.createdAt === "string" &&
      typeof o.updatedAt === "string"
    );
  }
}
