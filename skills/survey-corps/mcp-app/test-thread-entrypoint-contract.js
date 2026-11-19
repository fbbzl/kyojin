"use strict";

const assert = require("node:assert/strict");
const { startServer } = require("./test-stdio-helper");
const { server, complete } = startServer({ onReply: reply => {
  const check = checks.get(reply.id);
  if (!check) throw new Error("unexpected reply " + reply.id);
  checks.delete(reply.id);
  check(reply);
  if (!checks.size) finish();
} });
const checks = new Map();
let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  console.log("MCP App thread entrypoint contract test passed.");
  complete();
}

function request(id, params, check) {
  checks.set(id, check);
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params })}\n`);
}

request(1, { name: "show_sc_task_view", arguments: {} }, reply => {
  assert.deepEqual(reply.result.structuredContent.snapshot, { view_id: "sc-task-view:empty", state: "unknown" });
  assert.equal(reply.result.structuredContent.empty_view, true);
  assert.equal(reply.result.content[0].text, "SC Agent Tree 尚未收到任务快照。");
});
request(2, { name: "show_sc_task_view", arguments: { snapshot: { view_id: "sc-task-view:entry", state: "planned", __sc_empty_snapshot: true, empty_view: true } } }, reply => {
  assert.deepEqual(reply.result.structuredContent.snapshot, { view_id: "sc-task-view:entry", state: "planned", __sc_empty_snapshot: true, empty_view: true });
  assert.equal(reply.result.structuredContent.empty_view, undefined);
});
request(3, { name: "show_sc_task_view", arguments: {} }, reply => {
  assert.deepEqual(reply.result.structuredContent.snapshot, { view_id: "sc-task-view:entry", state: "planned", __sc_empty_snapshot: true, empty_view: true });
  assert.equal(reply.result.structuredContent.empty_view, undefined);
  assert.equal(reply.result.content[0].text, "SC Agent Tree 已恢复。");
});
request(4, { name: "show_sc_task_view", arguments: { snapshot: { state: "planned" } } }, reply => {
  assert.equal(reply.error.code, -32602);
  assert.match(reply.error.message, /snapshot\.view_id/);
});
request(5, { name: "show_sc_task_view", arguments: null }, reply => {
  assert.equal(reply.error.code, -32602);
  assert.match(reply.error.message, /arguments must be an object/);
});
request(6, { name: "show_sc_task_view", arguments: { unexpected: true } }, reply => {
  assert.equal(reply.error.code, -32602);
  assert.match(reply.error.message, /unknown/);
});
request(7, { name: "show_sc_task_view", arguments: {} }, reply => {
  assert.deepEqual(reply.result.structuredContent.snapshot, { view_id: "sc-task-view:entry", state: "planned", __sc_empty_snapshot: true, empty_view: true });
  assert.equal(reply.result.structuredContent.empty_view, undefined);
  assert.equal(reply.result.content[0].text, "SC Agent Tree 已恢复。");
});
