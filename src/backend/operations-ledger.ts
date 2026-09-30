/**
 * @file operations-ledger.ts
 * @path src/backend/operations-ledger.ts
 * @description Persists the locally reconstructed QvaPay operation history.
 * @module backend/operations
 * @status active
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { P2POperation } from "./operations.js";

export interface OperationLedgerEntry extends P2POperation {
  uuid: string;
  recordedAt: string;
  lastSeenAt: string;
}

export interface OperationReconciliation {
  remoteCount: number;
  ledgerCount: number;
  missingInLedger: string[];
  staleLocal: string[];
}

function ledgerPath(): string {
  return resolve(
    process.env.OPERATIONS_LEDGER_PATH ?? "data/operations-ledger.json",
  );
}

function normalize(value: unknown): OperationLedgerEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const uuid = String(record.uuid ?? "").trim();
  if (!uuid) return null;

  const now = new Date().toISOString();
  return {
    ...(record as Omit<
      OperationLedgerEntry,
      "uuid" | "recordedAt" | "lastSeenAt"
    >),
    uuid,
    recordedAt: typeof record.recordedAt === "string" ? record.recordedAt : now,
    lastSeenAt: typeof record.lastSeenAt === "string" ? record.lastSeenAt : now,
  };
}

export class OperationsLedgerStore {
  private entries = new Map<string, OperationLedgerEntry>();
  private initialized = false;

  /**
   * Loads the persisted operation ledger.
   * @returns Resolves after legacy/malformed records have been ignored.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const text = await readFile(ledgerPath(), "utf8");
      const parsed: unknown = JSON.parse(text);
      let values: unknown[] = [];
      if (Array.isArray(parsed)) {
        values = parsed;
      } else if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>).operations)
      ) {
        values = (parsed as Record<string, unknown>).operations as unknown[];
      }
      for (const value of values) {
        const entry = normalize(value);
        if (entry) this.entries.set(entry.uuid, entry);
      }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code !== "ENOENT") throw error;
    }
    this.initialized = true;
  }

  /**
   * Upserts remote operation snapshots by UUID.
   * @param operations Remote operations returned by QvaPay.
   * @returns Resolves after the ledger is atomically persisted.
   */
  async upsert(operations: P2POperation[]): Promise<void> {
    const now = new Date().toISOString();
    for (const operation of operations) {
      const uuid = String(operation.uuid ?? "").trim();
      if (!uuid) continue;
      const previous = this.entries.get(uuid);
      this.entries.set(uuid, {
        ...operation,
        uuid,
        recordedAt: previous?.recordedAt ?? now,
        lastSeenAt: now,
      });
    }
    await this.persist();
  }

  /**
   * Returns locally persisted operations sorted by most recently seen.
   * @returns A defensive copy of the ledger.
   */
  list(): OperationLedgerEntry[] {
    return [...this.entries.values()]
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .map((entry) => ({ ...entry }));
  }

  /**
   * Reconciles remote operation IDs with the local ledger.
   * @param remoteOperations Operations from the completed remote synchronization.
   * @returns Differences between remote and local identifiers.
   */
  reconcile(remoteOperations: P2POperation[]): OperationReconciliation {
    const remoteIds = new Set(
      remoteOperations
        .map((operation) => String(operation.uuid ?? "").trim())
        .filter(Boolean),
    );
    const localIds = new Set(this.entries.keys());
    return {
      remoteCount: remoteIds.size,
      ledgerCount: localIds.size,
      missingInLedger: [...remoteIds].filter((id) => !localIds.has(id)),
      staleLocal: [...localIds].filter((id) => !remoteIds.has(id)),
    };
  }

  /**
   * Returns whether the store has been initialized.
   * @returns True after the first successful initialization.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private async persist(): Promise<void> {
    const path = ledgerPath();
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}`;
    await writeFile(temp, JSON.stringify(this.list(), null, 2) + "\n", "utf8");
    await rename(temp, path);
  }
}
