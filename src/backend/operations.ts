/**
 * @file operations.ts
 * @path src/backend/operations.ts
 * @description Implements operations for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
export type OperationRole = "owner" | "peer" | "unknown";
/**
 * Public type OperationAction used by the module.
 */
export type OperationAction = "paid" | "received" | "cancel" | "rate" | "chat";

/**

 * Public interface OperationParty used by the module.

 */

export interface OperationParty {
  uuid?: string | number | null;
  id?: string | number | null;
  username?: string | null;
  name?: string | null;
}

/**

 * Public interface P2POperation used by the module.

 */

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

/**
 * Implements the sameId operation for this module.
 * @param a Input used by the operation.
 * @param b Input used by the operation.
 * @returns The operation result.
 */
function sameId(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b);
}

/**
 * Implements the partyMatchesCurrentUser operation for this module.
 * @param party Input used by the operation.
 * @param currentUserId Input used by the operation.
 * @returns The operation result.
 */
function partyMatchesCurrentUser(
  party: OperationParty | null | undefined,
  currentUserId: unknown,
): boolean {
  return Boolean(
    party &&
    (sameId(party.uuid, currentUserId) || sameId(party.id, currentUserId)),
  );
}

/**
 * Implements the identifyOperationRole operation for this module.
 * @param operation Input used by the operation.
 * @returns The operation result.
 */
export function identifyOperationRole(
  operation: P2POperation,
  currentUserId?: string | number | null,
): OperationRole {
  if (partyMatchesCurrentUser(operation.User, currentUserId)) return "owner";
  if (partyMatchesCurrentUser(operation.Peer, currentUserId)) return "peer";
  return "unknown";
}

/**
 * Implements the availableOperationActions operation for this module.
 * @param operation Input used by the operation.
 * @param role Input used by the operation.
 * @returns The operation result.
 */
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
  if (status === "open" && role === "owner") actions.push("cancel");
  if (
    status === "revision" &&
    ((type === "buy" && role === "owner") ||
      (type === "sell" && role === "peer"))
  ) {
    actions.push("cancel");
  }
  if (status === "completed") actions.unshift("rate");

  return [...new Set(actions)];
}

/**
 * Implements the operationBucket operation for this module.
 * @param status Input used by the operation.
 * @returns The operation result.
 */
export function operationBucket(status: unknown): string {
  switch (String(status ?? "").toLowerCase()) {
    case "revision":
      return "revision";
    case "processing":
      return "processing";
    case "paid":
      return "paid";
    case "open":
      return "open";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "other";
  }
}
