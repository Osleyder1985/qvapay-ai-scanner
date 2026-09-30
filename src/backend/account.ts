export interface AccountSnapshot {
  balanceUsd: number | null;
  user: Record<string, unknown> | null;
  identitySource: "own_open_offer" | "own_p2p_offer" | "unavailable";
  fetchedAt: string;
}

async function firstProfile(
  response: Response,
  readPayload: (response: Response) => Promise<unknown>,
  preferOwner: boolean,
): Promise<Record<string, unknown> | null> {
  if (!response.ok) return null;
  const payload = await readPayload(response);
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data)) return null;

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const candidate = preferOwner ? record.User : record.Peer;
    if (candidate && typeof candidate === "object") return candidate as Record<string, unknown>;
  }

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const candidate = record.User ?? record.Peer;
    if (candidate && typeof candidate === "object") return candidate as Record<string, unknown>;
  }

  return null;
}

export async function fetchAccountSnapshot(
  fetchBalance: () => Promise<Response>,
  fetchOwnOpen: () => Promise<Response>,
  fetchOwnP2P: () => Promise<Response>,
  readPayload: (response: Response) => Promise<unknown>,
): Promise<AccountSnapshot> {
  const [balanceResponse, openResponse, p2pResponse] = await Promise.all([
    fetchBalance(),
    fetchOwnOpen(),
    fetchOwnP2P(),
  ]);

  const balancePayload = await readPayload(balanceResponse);
  let balanceUsd: number | null = null;
  if (balanceResponse.ok && balancePayload && typeof balancePayload === "object") {
    const value = (balancePayload as Record<string, unknown>).balance;
    balanceUsd = Number.isFinite(Number(value)) ? Number(value) : null;
  }

  const owner = await firstProfile(openResponse, readPayload, true);
  const fallback = await firstProfile(p2pResponse, readPayload, false);

  return {
    balanceUsd,
    user: owner ?? fallback,
    identitySource: owner ? "own_open_offer" : fallback ? "own_p2p_offer" : "unavailable",
    fetchedAt: new Date().toISOString(),
  };
}
