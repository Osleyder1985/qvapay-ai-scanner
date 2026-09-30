/**
 * @file auto-apply.ts
 * @path src/backend/auto-apply.ts
 * @description Implements auto apply for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**

 * Public type AutoApplyType used by the module.

 */

export type AutoApplyType = "sell" | "buy";

/**

 * Public interface AutoApplyConfig used by the module.

 */

export interface AutoApplyConfig {
  enabled: boolean;
  type: AutoApplyType;
  coin: string;
  rateMin: number | null;
  rateMax: number | null;
  amountMin: number | null;
  amountMax: number | null;
  dailyMaxQusd: number | null;
  maxConcurrent: number;
}

/**

 * Public interface AutoApplyStatus used by the module.

 */

export interface AutoApplyStatus {
  running: boolean;
  lastScanAt: string | null;
  lastActionAt: string | null;
  lastMessage: string;
  dailyDate: string;
  dailyAppliedQusd: number;
  recentApplyAttempts: string[];
  appliedOfferIds: string[];
}

interface PersistedState {
  dailyDate: string;
  dailyAppliedQusd: number;
  recentApplyAttempts: string[];
  appliedOfferIds: string[];
  vipRejectedOffers: Record<string, string>;
}

interface EngineDependencies {
  fetchMarket: (params: URLSearchParams) => Promise<Response>;
  applyOffer: (uuid: string) => Promise<Response>;
  fetchOwnProcessing: () => Promise<Response>;
  readPayload: (response: Response) => Promise<unknown>;
}

const DEFAULT_CONFIG: AutoApplyConfig = {
  enabled: false,
  type: "sell",
  coin: "",
  rateMin: null,
  rateMax: null,
  amountMin: null,
  amountMax: null,
  dailyMaxQusd: null,
  maxConcurrent: 1,
};

const APPLY_LIMIT = 2;
const APPLY_WINDOW_MS = 60_000;
const SCAN_INTERVAL_MS = 30_000;
const VIP_REJECTION_COOLDOWN_MS = 5 * 60_000;

/**
 * Implements the today operation for this module.

 * @returns The operation result.
 */
function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

/**
 * Implements the asNullablePositiveNumber operation for this module.

 * @returns The operation result.
 */
function asNullablePositiveNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(field + " debe ser un número mayor o igual que 0.");
  }

  return number;
}

/**
 * Implements the asPositiveInteger operation for this module.

 * @returns The operation result.
 */
function asPositiveInteger(value: unknown, field: string, minimum = 1): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(field + " debe ser un entero mayor o igual que " + minimum + ".");
  }

  return number;
}

/**
 * Implements the isVipOnlyOffer operation for this module.

 * @returns The operation result.
 */
export function isVipOnlyOffer(offer: Record<string, unknown>): boolean {
  const value = offer.only_vip;
  return value === true || value === 1 ||
    ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

/**
 * Implements the normalizeAutoApplyConfig operation for this module.

 * @returns The operation result.
 */
export function normalizeAutoApplyConfig(input: unknown): AutoApplyConfig {
  const value = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};

  const type = String(value.type ?? DEFAULT_CONFIG.type).toLowerCase();
  if (type !== "sell" && type !== "buy") {
    throw new Error("type debe ser sell o buy.");
  }

  const rateMin = asNullablePositiveNumber(value.rateMin, "rateMin");
  const rateMax = asNullablePositiveNumber(value.rateMax, "rateMax");
  const amountMin = asNullablePositiveNumber(value.amountMin, "amountMin");
  const amountMax = asNullablePositiveNumber(value.amountMax, "amountMax");
  const dailyMaxQusd = asNullablePositiveNumber(value.dailyMaxQusd, "dailyMaxQusd");
  const maxConcurrent = asPositiveInteger(
    value.maxConcurrent ?? DEFAULT_CONFIG.maxConcurrent,
    "maxConcurrent",
  );

  if (rateMin !== null && rateMax !== null && rateMin > rateMax) {
    throw new Error("rateMin no puede ser mayor que rateMax.");
  }

  if (amountMin !== null && amountMax !== null && amountMin > amountMax) {
    throw new Error("amountMin no puede ser mayor que amountMax.");
  }

  const normalizedType = type as AutoApplyType;

  return {
    enabled: Boolean(value.enabled),
    type: normalizedType,
    coin: String(value.coin ?? "").trim().toUpperCase(),
    rateMin,
    rateMax,
    amountMin,
    amountMax,
    dailyMaxQusd,
    maxConcurrent,
  };
}

/**

 * Public class AutoApplyEngine used by the module.

 */

export class AutoApplyEngine {
  private readonly configPath: string;
  private config: AutoApplyConfig = DEFAULT_CONFIG;
  private state: PersistedState = {
    dailyDate: today(),
    dailyAppliedQusd: 0,
    recentApplyAttempts: [],
    appliedOfferIds: [],
    vipRejectedOffers: {},
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private statusMessage = "Auto-Apply desactivado.";
  private lastScanAt: string | null = null;
  private lastActionAt: string | null = null;

  constructor(private readonly dependencies: EngineDependencies) {
    this.configPath = process.env.AUTO_APPLY_CONFIG_PATH
      ? resolve(process.env.AUTO_APPLY_CONFIG_PATH)
      : resolve(process.cwd(), "data/auto-apply.json");
  }

  /**
   * Executes the initialize method and preserves the module's documented invariants.

   * @returns Promise<void> returned by the method.
   */
  async initialize(): Promise<void>  {
    await mkdir(dirname(this.configPath), { recursive: true });

    try {
      const raw = await readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as {
        config?: unknown;
        state?: Partial<PersistedState>;
      };

      this.config = normalizeAutoApplyConfig(parsed.config);
      this.state = {
        dailyDate: parsed.state?.dailyDate ?? today(),
        dailyAppliedQusd: Number(parsed.state?.dailyAppliedQusd ?? 0),
        recentApplyAttempts: Array.isArray(parsed.state?.recentApplyAttempts)
          ? parsed.state.recentApplyAttempts.map(String)
          : [],
        appliedOfferIds: Array.isArray(parsed.state?.appliedOfferIds)
          ? parsed.state.appliedOfferIds.map(String)
          : [],
        vipRejectedOffers: parsed.state?.vipRejectedOffers &&
            typeof parsed.state.vipRejectedOffers === "object"
          ? Object.fromEntries(
              Object.entries(parsed.state.vipRejectedOffers).map(([uuid, timestamp]) => [
                String(uuid),
                String(timestamp),
              ]),
            )
          : {},
      };
    } catch {
      await this.persist();
    }

    this.resetDailyStateIfNeeded();
    void this.persist();

    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * Executes the getConfig method and preserves the module's documented invariants.

   * @returns AutoApplyConfig returned by the method.
   */
  getConfig(): AutoApplyConfig  {
    return { ...this.config };
  }

  /**
   * Executes the getStatus method and preserves the module's documented invariants.

   * @returns AutoApplyStatus returned by the method.
   */
  getStatus(): AutoApplyStatus  {
    return {
      running: this.timer !== null,
      lastScanAt: this.lastScanAt,
      lastActionAt: this.lastActionAt,
      lastMessage: this.statusMessage,
      dailyDate: this.state.dailyDate,
      dailyAppliedQusd: this.state.dailyAppliedQusd,
      recentApplyAttempts: [...this.state.recentApplyAttempts],
      appliedOfferIds: [...this.state.appliedOfferIds],
    };
  }

  /**
   * Executes the updateConfig method and preserves the module's documented invariants.
   * @param input Input used by the method.
   * @returns Promise<AutoApplyConfig> returned by the method.
   */
  async updateConfig(input: unknown): Promise<AutoApplyConfig>  {
    const next = normalizeAutoApplyConfig(input);
    this.config = next;
    await this.persist();

    if (next.enabled) {
      this.start();
      void this.scan();
    } else {
      this.stop();
      this.statusMessage = "Auto-Apply desactivado.";
    }

    return this.getConfig();
  }

  /**
   * Executes the start method and preserves the module's documented invariants.

   * @returns void returned by the method.
   */
  start(): void  {
    if (this.timer !== null) return;

    this.statusMessage = "Auto-Apply activo; esperando el próximo escaneo.";
    this.timer = setInterval(() => {
      void this.scan();
    }, SCAN_INTERVAL_MS);
  }

  /**
   * Executes the stop method and preserves the module's documented invariants.

   * @returns void returned by the method.
   */
  stop(): void  {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resetDailyStateIfNeeded(): void {
    const currentDate = today();
    if (this.state.dailyDate !== currentDate) {
      this.state.dailyDate = currentDate;
      this.state.dailyAppliedQusd = 0;
      this.state.recentApplyAttempts = [];
      void this.persist();
    }
  }

  private pruneAttempts(now = Date.now()): void {
    const threshold = now - APPLY_WINDOW_MS;
    this.state.recentApplyAttempts = this.state.recentApplyAttempts.filter(
      (timestamp) => Number(timestamp) >= threshold,
    );
  }

  private pruneVipRejectedOffers(now = Date.now()): void {
    const threshold = now - VIP_REJECTION_COOLDOWN_MS;
    for (const [uuid, timestamp] of Object.entries(this.state.vipRejectedOffers)) {
      if (Number(timestamp) < threshold) {
        delete this.state.vipRejectedOffers[uuid];
      }
    }
  }

  private wasRecentlyVipRejected(uuid: string): boolean {
    const timestamp = Number(this.state.vipRejectedOffers[uuid]);
    return Number.isFinite(timestamp) &&
      Date.now() - timestamp < VIP_REJECTION_COOLDOWN_MS;
  }

  private markVipRejected(uuid: string): void {
    this.state.vipRejectedOffers[uuid] = String(Date.now());
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify({ config: this.config, state: this.state }, null, 2);
    await mkdir(dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, payload + "\n", "utf8");
  }

  private async ownProcessingCount(): Promise<number> {
    const response = await this.dependencies.fetchOwnProcessing();

    if (!response.ok) {
      throw new Error("No se pudo consultar las operaciones propias: HTTP " + response.status);
    }

    const payload = await this.dependencies.readPayload(response) as Record<string, unknown>;
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return data.length;
  }

  private matches(offer: Record<string, unknown>): boolean {
    const status = String(offer.status ?? "open").toLowerCase();
    const type = String(offer.type ?? "").toLowerCase();
    const coin = String(offer.coin ?? "").toUpperCase();
    const amount = Number(offer.amount);
    const receive = Number(offer.receive);
    const currentRate = amount > 0 ? receive / amount : NaN;

    if (status !== "open") return false;
    if (type !== this.config.type) return false;
    if (isVipOnlyOffer(offer)) return false;
    if (this.config.coin && coin !== this.config.coin) return false;
    if (!Number.isFinite(amount) || !Number.isFinite(currentRate)) return false;
    if (this.config.rateMin !== null && currentRate < this.config.rateMin) return false;
    if (this.config.rateMax !== null && currentRate > this.config.rateMax) return false;
    if (this.config.amountMin !== null && amount < this.config.amountMin) return false;
    if (this.config.amountMax !== null && amount > this.config.amountMax) return false;
    if (this.config.dailyMaxQusd !== null &&
        this.state.dailyAppliedQusd + amount > this.config.dailyMaxQusd) {
      return false;
    }

    return true;
  }

  /**
   * Executes the scan method and preserves the module's documented invariants.

   * @returns Promise<void> returned by the method.
   */
  async scan(): Promise<void>  {
    if (!this.config.enabled || this.scanning) return;

    this.scanning = true;
    this.lastScanAt = new Date().toISOString();
    this.resetDailyStateIfNeeded();
    this.pruneAttempts();
    this.pruneVipRejectedOffers();

    try {
      const processingCount = await this.ownProcessingCount();
      if (processingCount >= this.config.maxConcurrent) {
        this.statusMessage =
          "Pausado por límite de operaciones simultáneas (" + processingCount + "/" +
          this.config.maxConcurrent + ").";
        return;
      }

      const params = new URLSearchParams({
        page: "1",
        take: "100",
        type: this.config.type,
        orderBy: "updated_at",
        orderType: "desc",
      });

      if (this.config.coin) params.set("coin", this.config.coin);

      const marketResponse = await this.dependencies.fetchMarket(params);
      if (!marketResponse.ok) {
        throw new Error("No se pudo consultar el mercado: HTTP " + marketResponse.status);
      }

      const payload = await this.dependencies.readPayload(marketResponse) as Record<string, unknown>;
      const offers = Array.isArray(payload?.data)
        ? payload.data as Array<Record<string, unknown>>
        : [];

      const candidates = offers
        .filter((offer) => {
          const uuid = String(offer.uuid ?? offer.id ?? "");
          return uuid &&
            !this.state.appliedOfferIds.includes(uuid) &&
            !this.wasRecentlyVipRejected(uuid) &&
            this.matches(offer);
        })
        .sort((a, b) => {
          const rateA = Number(a.receive) / Number(a.amount);
          const rateB = Number(b.receive) / Number(b.amount);
          return rateA - rateB;
        });

      if (!candidates.length) {
        this.statusMessage = "Escaneo completado: no hay ofertas que cumplan las reglas.";
        return;
      }

      let availableConcurrent = this.config.maxConcurrent - processingCount;

      for (const offer of candidates) {
        if (availableConcurrent <= 0) break;

        this.pruneAttempts();
        if (this.state.recentApplyAttempts.length >= APPLY_LIMIT) {
          this.statusMessage = "Escaneo pausado por el límite de QvaPay: 2 aplicaciones cada 60 segundos.";
          break;
        }

        const uuid = String(offer.uuid ?? offer.id ?? "");
        const amount = Number(offer.amount);

        if (this.config.dailyMaxQusd !== null &&
            this.state.dailyAppliedQusd + amount > this.config.dailyMaxQusd) {
          continue;
        }

        this.state.recentApplyAttempts.push(String(Date.now()));

        const response = await this.dependencies.applyOffer(uuid);
        const responsePayload = await this.dependencies.readPayload(response);

        if (response.ok) {
          this.state.appliedOfferIds.push(uuid);
          this.state.dailyAppliedQusd += amount;
          availableConcurrent -= 1;
          this.lastActionAt = new Date().toISOString();
          this.statusMessage =
            "Oferta " + uuid + " aceptada automáticamente (" + amount + " QUSD).";
          await this.persist();
          continue;
        }

        const detail = responsePayload && typeof responsePayload === "object"
          ? JSON.stringify(responsePayload)
          : String(responsePayload);

        this.statusMessage =
          "QvaPay rechazó la aplicación automática de " + uuid + ": HTTP " +
          response.status + " " + detail;

        if (
          response.status === 400 &&
          detail.toLowerCase().includes("vip")
        ) {
          this.markVipRejected(uuid);
          this.statusMessage =
            "Oferta " + uuid + " descartada: QvaPay exige VIP para aplicar. " +
            "No se volverá a intentar durante 5 minutos.";
        }

        if (response.status === 429) {
          break;
        }
      }

      await this.persist();
    } catch (error) {
      this.statusMessage =
        "⚠️ Auto-Apply: " + (error instanceof Error ? error.message : String(error));
    } finally {
      this.scanning = false;
    }
  }
}