export interface AccountSnapshot {
  balanceUsd: number | null;
  user: Record<string, unknown> | null;
  fetchedAt: string;
}

export async function fetchAccountSnapshot(
  fetchBalance: () => Promise<Response>,
  fetchOwnP2P: () => Promise<Response>,
  readPayload: (response: Response) => Promise<unknown>,
): Promise<AccountSnapshot> {
  const [balanceResponse, p2pResponse] = await Promise.all([fetchBalance(), fetchOwnP2P()]);
  const balancePayload = await readPayload(balanceResponse);
  const p2pPayload = await readPayload(p2pResponse);

  let balanceUsd: number | null = null;
  if (balanceResponse.ok && balancePayload && typeof balancePayload === "object") {
    const value = (balancePayload as Record<string, unknown>).balance;
    balanceUsd = Number.isFinite(Number(value)) ? Number(value) : null;
  }

  let user: Record<string, unknown> | null = null;
  if (p2pResponse.ok && p2pPayload && typeof p2pPayload === "object") {
    const data = (p2pPayload as Record<string, unknown>).data;
    if (Array.isArray(data)) {
      const own = data.find((offer) => offer && typeof offer === "object" && (offer as Record<string, unknown>).User);
      const candidate = own && typeof own === "object" ? (own as Record<string, unknown>).User : null;
      if (candidate && typeof candidate === "object") user = candidate as Record<string, unknown>;
    }
  }

  return { balanceUsd, user, fetchedAt: new Date().toISOString() };
}
