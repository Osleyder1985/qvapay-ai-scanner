export type OperationRole = "owner" | "peer" | "unknown";
export type OperationAction = "paid" | "received" | "cancel" | "rate" | "chat";

export interface OperationParty {
  uuid?: string | number | null;
  id?: string | number | null;
  username?: string | null;
  name?: string | null;
}

export interface P2POperation {
  uuid?: string;
  type?: string;
  status?: string;
  amount?: number | string;
  receive?: number | string;
  currentUserId?: string | number | null;
  User?: OperationParty | null;
  Peer?: OperationParty | null;
}

function sameId(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b);
}

function partyMatchesCurrentUser(party: OperationParty | null | undefined, currentUserId: unknown): boolean {
  return Boolean(
    party &&
    (sameId(party.uuid, currentUserId) || sameId(party.id, currentUserId))
  );
}

export function identifyOperationRole(
  operation: P2POperation,
  currentUserId?: string | number | null,
): OperationRole {
  if (partyMatchesCurrentUser(operation.User, currentUserId)) return "owner";
  if (partyMatchesCurrentUser(operation.Peer, currentUserId)) return "peer";
  return "unknown";
}

export function availableOperationActions(
  operation: P2POperation,
  role: OperationRole,
): OperationAction[] {
  const type = String(operation.type ?? "").toLowerCase();
  const status = String(operation.status ?? "").toLowerCase();

  if (role === "unknown") {
    return status === "completed" ? ["rate", "chat"] : ["chat"];
  }

  const actions: OperationAction[] = ["chat"];

  if (status === "processing") {
    const paysFiat =
      (type === "buy" && role === "owner") ||
      (type === "sell" && role === "peer");
    if (paysFiat) actions.unshift("paid");
  }

  if (status === "paid") {
    const receivesFiat =
      (type === "sell" && role === "owner") ||
      (type === "buy" && role === "peer");
    if (receivesFiat) actions.unshift("received");
  }

  if (["processing", "paid"].includes(status)) actions.push("cancel");
  if (
    status === "revision" &&
    ((type === "buy" && role === "owner") || (type === "sell" && role === "peer"))
  ) {
    actions.push("cancel");
  }
  if (status === "completed") actions.unshift("rate");

  return [...new Set(actions)];
}

export function operationBucket(status: unknown): string {
  switch (String(status ?? "").toLowerCase()) {
    case "revision": return "revision";
    case "processing": return "processing";
    case "paid": return "paid";
    case "open": return "open";
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    default: return "other";
  }
}
