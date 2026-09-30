import test from "node:test";
import assert from "node:assert/strict";
import {
  availableOperationActions,
  identifyOperationRole,
  operationBucket,
} from "../backend/operations.js";

const base = {
  uuid: "op-1",
  type: "sell",
  status: "processing",
  User: { uuid: "owner-1", username: "owner" },
  Peer: { uuid: "peer-1", username: "peer" },
};

test("identifies owner and peer from currentUserId", () => {
  assert.equal(identifyOperationRole(base, "owner-1"), "owner");
  assert.equal(identifyOperationRole(base, "peer-1"), "peer");
  assert.equal(identifyOperationRole(base, "other"), "unknown");
});

test("sell peer can mark paid while sell owner can receive", () => {
  assert.ok(availableOperationActions(base, "peer").includes("paid"));
  assert.ok(!availableOperationActions(base, "owner").includes("paid"));

  const paid = { ...base, status: "paid" };
  assert.ok(availableOperationActions(paid, "owner").includes("received"));
  assert.ok(!availableOperationActions(paid, "peer").includes("received"));
});

test("buy reverses the payment/receipt roles", () => {
  const buy = { ...base, type: "buy", status: "processing" };
  assert.ok(availableOperationActions(buy, "owner").includes("paid"));
  assert.ok(!availableOperationActions(buy, "peer").includes("paid"));

  const paid = { ...buy, status: "paid" };
  assert.ok(availableOperationActions(paid, "peer").includes("received"));
  assert.ok(!availableOperationActions(paid, "owner").includes("received"));
});

test("open operations can be cancelled by their owner", () => {
  assert.ok(availableOperationActions({ ...base, status: "open" }, "owner").includes("cancel"));
  assert.ok(!availableOperationActions({ ...base, status: "open" }, "peer").includes("cancel"));
});

test("revision can be cancelled only by the fiat payer", () => {
  assert.ok(availableOperationActions({ ...base, status: "revision" }, "peer").includes("cancel"));
  assert.ok(!availableOperationActions({ ...base, status: "revision" }, "owner").includes("cancel"));
  assert.ok(availableOperationActions({ ...base, type: "buy", status: "revision" }, "owner").includes("cancel"));
  assert.ok(!availableOperationActions({ ...base, type: "buy", status: "revision" }, "peer").includes("cancel"));
});

test("completed operations expose rating and status buckets are normalized", () => {
  assert.ok(availableOperationActions({ ...base, status: "completed" }, "owner").includes("rate"));
  assert.equal(operationBucket("revision"), "revision");
  assert.equal(operationBucket("CANCELLED"), "cancelled");
  assert.equal(operationBucket("unexpected"), "other");
});
