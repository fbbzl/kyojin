"use strict";

const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { startServer } = require("./test-stdio-helper");

// User requirement (P1): only selected roles with running status accrue time; global stops take precedence.
// Observe the public stdio tool, independently of the tracker's injected-clock unit tests.
const clients = [];
function client() {
  let nextId = 0;
  const pending = new Map();
  const session = startServer({
    timeoutMs: 15000,
    onReply(reply) {
      assert.ok(pending.has(reply.id), "unexpected stdio response");
      pending.get(reply.id).resolve(reply);
      pending.delete(reply.id);
    },
    onFailure(error) {
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      console.error(error);
      process.exitCode = 1;
    },
  });
  const request = (args, customId) => new Promise((resolve, reject) => {
    const id = customId ?? ++nextId;
    pending.set(id, { resolve, reject });
    session.server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "show_sc_task_view", arguments: args } })}\n`);
  });
  const show = async snapshot => {
    const reply = await request(snapshot ? { snapshot } : {});
    assert.equal(reply.error, undefined, JSON.stringify(reply.error));
    return reply.result.structuredContent.snapshot;
  };
  const result = { request, show, complete: session.complete };
  clients.push(result);
  return result;
}

function task(viewId, state, statuses, metrics) {
  return {
    view_id: viewId,
    state,
    work_unit: { roles: ["dev", "cr", "qa"], ...(metrics ? { metrics } : {}) },
    role_details: Object.fromEntries(Object.entries(statuses).map(([role, status]) => [role, { status }])),
  };
}
const elapsed = snapshot => snapshot.work_unit.metrics.elapsed_ms;
const roleElapsed = (snapshot, role) => snapshot.role_details[role].metrics.elapsed_ms;

async function main() {
  const first = client();
  const knownViews = new Set();
  async function show(snapshot) {
    const result = await first.show(snapshot);
    if (snapshot?.work_unit) knownViews.add(snapshot.view_id);
    return result;
  }
  const a = "qa-elapsed-a";
  const planned = await show(task(a, "planned", { dev: "pending", qa: "pending" }));
  assert.equal(elapsed(planned), 0, "planned tasks automatically start at zero");
  assert.equal(roleElapsed(planned, "dev"), 0);

  await show(task(a, "dev_in_progress", { dev: "running", qa: "pending" }));
  await delay(60);
  const concurrent = await show();
  assert.ok(elapsed(concurrent) >= 20, "restoring an active view must sample the running server clock");
  assert.equal(elapsed(concurrent), roleElapsed(concurrent, "dev"));
  assert.equal(roleElapsed(concurrent, "qa"), 0, "pending QA must not accrue time while DEV executes");

  const waiting = await show(task(a, "needs_user_confirm", { dev: "needs_user_confirm", qa: "pending" }));
  await delay(60);
  assert.deepEqual(await show(), waiting, "global user confirmation must freeze stopped role timers");

  const resumed = task(a, "dev_in_progress", { dev: "running", qa: "pending" }, { elapsed_ms: 9000000, total_tokens: 1234 });
  resumed.role_details.dev.metrics = { elapsed_ms: 8000000, total_tokens: 321 };
  const resumeSample = await show(resumed);
  assert.equal(elapsed(resumeSample), elapsed(waiting), "echoed or stale elapsed values must not overwrite tracked time");
  await delay(60);
  const paused = await show(task(a, "paused", { dev: "pending", qa: "pending" }));
  assert.ok(elapsed(paused) >= elapsed(waiting) + 20, "resuming work must add a new measured interval");
  assert.equal(roleElapsed(paused, "qa"), roleElapsed(waiting, "qa"), "pending roles must stay frozen");
  await delay(60);
  assert.deepEqual(await show(), paused, "a paused role must not keep its task timer active");
  await show(task(a, "dev_in_progress", { dev: "running", qa: "pending" }));
  await show(task(a, "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" }));
  await show(task(a, "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
  await show(task(a, "qa_passed", { dev: "passed", cr: "passed", qa: "passed" }));
  const finished = await show(task(a, "workflow_ready", { dev: "passed", cr: "passed", qa: "passed" }));
  await delay(60);
  assert.deepEqual(await show(), finished, "completed tasks must keep every role timer frozen");

  const b = "qa-elapsed-b";
  const baseline = task(b, "planned", { dev: "pending", qa: "pending" }, { elapsed_ms: 500, total_tokens: 999 });
  baseline.role_details.dev.metrics = { elapsed_ms: 200 };
  const seeded = await show(baseline);
  assert.equal(elapsed(seeded), 500, "first valid elapsed input remains a compatibility baseline");
  assert.equal(roleElapsed(seeded, "dev"), 200);
  const bRunning = task(b, "dev_in_progress", { dev: "running", qa: "pending" });
  bRunning.work_unit.roles = [" DEV ", "dev", "cr", "qa"];
  await show(bRunning);
  await delay(60);
  assert.equal(elapsed(await show(task(a, "workflow_ready", { dev: "passed", cr: "passed", qa: "passed" }))), elapsed(finished), "switching views must preserve the first task's timer");
  const bStopped = await show(task(b, "paused", { dev: "pending", qa: "pending" }));
  assert.ok(elapsed(bStopped) >= 520, "another view must continue accumulating while it is not the latest snapshot");
  assert.equal(elapsed(bStopped) - roleElapsed(bStopped, "dev"), 300, "normalized duplicate role names must not count twice");

  // P1 regression: reject stale task phases; missing DEV history must not activate DEV during QA.
  for (const [index, missing] of [undefined].entries()) {
    const id = "qa-elapsed-explicit-qa-" + index;
    const qaReady = await show(task(id, "ready_for_qa", { dev: missing, cr: "passed", qa: "pending" }));
    const stale = await first.request({ snapshot: task(id, "dev_in_progress", { dev: missing, cr: "passed", qa: "running" }) });
    assert.equal(stale.error?.code, -32602);
    assert.deepEqual(await show(), qaReady, "a stale DEV phase must preserve the stopped QA snapshot");
    await show(task(id, "ready_for_qa", { dev: missing, cr: "passed", qa: "running" }));
    await delay(60);
    const qaOnly = await show();
    assert.equal(roleElapsed(qaOnly, "dev"), 0, "missing DEV status must not inherit task-level activity");
    assert.ok(roleElapsed(qaOnly, "qa") >= 20, "explicit QA running must accrue time");
    assert.equal(elapsed(qaOnly), roleElapsed(qaOnly, "qa"));
    const stopped = await show(task(id, "needs_user_confirm", { dev: missing, cr: "passed", qa: "needs_user_confirm" }));
    await delay(60);
    assert.deepEqual(await show(), stopped, "leaving running must freeze both task and roles");
  }

  // Invalid input must not mutate cached snapshots or elapsed records.
  const aliasId = "qa-elapsed-invalid-status";
  const inactive = await show(task(aliasId, "planned", { dev: "pending", qa: "pending" }));
  for (const status of ["completed", "waiting", "not_started", "preparing", "in_progress", "in-progress", "working", "active", "started", "started_working", " RUNNING ", "future_status", "", null, 42, false, {}, []]) {
    const rejected = await first.request({ snapshot: task(aliasId, "dev_in_progress", { dev: status, qa: "pending" }) });
    assert.equal(rejected.error?.code, -32602, "invalid role status must reject: " + JSON.stringify(status));
    assert.match(rejected.error.message, /status must be one of/);
    await delay(20);
    assert.deepEqual(await show(), inactive, "invalid input must leave cache and stopped timers unchanged");
  }
  const conflict = await first.request({ snapshot: task(aliasId, "dev_in_progress", { dev: "running", qa: "running" }) });
  assert.equal(conflict.error?.code, -32602);
  assert.match(conflict.error.message, /only one active role/);
  assert.deepEqual(await show(), inactive, "conflict rejection must not start either role timer");
  const invalidQa = [];
  for (const status of ["pending", "running", "blocked", "needs_user_confirm", undefined, "completed", " PASSED "]) {
    const input = task(aliasId, "ready_for_qa", { dev: "passed", cr: status, qa: "running" });
    invalidQa.push(input);
  }
  const missingCr = task(aliasId, "ready_for_qa", { dev: "passed", qa: "running" });
  invalidQa.push(missingCr);
  for (const roles of [["dev", "qa"], "qa"]) {
    const input = task(aliasId, "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" });
    input.work_unit.roles = roles;
    invalidQa.push(input);
  }
  for (const input of invalidQa) {
    const rejected = await first.request({ snapshot: input });
    assert.equal(rejected.error?.code, -32602, "QA must wait for selected CR with exact passed status");
    assert.match(rejected.error.message, /selected CR has passed|only one active role|status must be one of|selected role order/);
    await delay(20);
    assert.deepEqual(await show(), inactive, "invalid QA transitions must not mutate the cached view or task/role timers");
  }
  await show(task(aliasId, "dev_in_progress", { dev: "running", qa: "pending" }));
  await delay(60);
  const devPassed = await show(task(aliasId, "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" }));
  assert.ok(roleElapsed(devPassed, "dev") >= 20);
  await delay(60);
  const crPassed = await show(task(aliasId, "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
  assert.ok(roleElapsed(crPassed, "cr") >= 20, "formal review must accrue its own serial interval");
  assert.equal(roleElapsed(crPassed, "dev"), roleElapsed(devPassed, "dev"));
  await delay(60);
  const qaPassed = await show(task(aliasId, "qa_passed", { dev: "passed", cr: "passed", qa: "passed" }));
  await show(task(aliasId, "workflow_ready", { dev: "passed", cr: "passed", qa: "passed" }));
  assert.equal(roleElapsed(qaPassed, "dev"), roleElapsed(devPassed, "dev"), "handoff must freeze DEV");
  assert.equal(roleElapsed(qaPassed, "cr"), roleElapsed(crPassed, "cr"), "QA handoff must freeze CR");
  assert.ok(roleElapsed(qaPassed, "qa") >= 20, "handoff must start QA");
  const roundingDelta = elapsed(qaPassed) - ["dev", "cr", "qa"].reduce((sum, role) => sum + roleElapsed(qaPassed, role), 0);
  assert.ok(roundingDelta >= 0 && roundingDelta <= 2, "separately floored serial task and three-role elapsed values may differ by at most two milliseconds");

  const excluded = task("qa-elapsed-excluded", "planned", { req: "running", dev: "pending" });
  excluded.work_unit.roles = ["dev"];
  await show(excluded);
  await delay(60);
  assert.equal(elapsed(await show()), 0, "unselected running roles must not activate a task timer");
  const beforeUnknown = await show();
  const unknown = await first.request({ snapshot: task("qa-elapsed-unknown", "future_state", { dev: "pending" }) });
  assert.equal(unknown.error?.code, -32602);
  assert.match(unknown.error.message, /Unknown workflow state/);
  await delay(60);
  assert.deepEqual(await show(), beforeUnknown, "unknown task state must not replace the snapshot or invent active work");

  for (const state of ["cr_blocked", "qa_failed", "qa_conditional"]) {
    const repairId = `qa-elapsed-repair-${state}`;
    const source = task(repairId, state, { dev: "running", cr: state === "cr_blocked" ? "blocked" : "pending", qa: state === "cr_blocked" ? "pending" : "blocked" });
    Object.assign(source.work_unit, { work_unit_id: repairId, reference_version: "v1" });
    source.handoffs = [{ from: state === "cr_blocked" ? "cr" : "qa", to: "dev", state, handoff_result: "accepted", work_unit_id: repairId, reference_version: "v1", files: ["src/app.js"], decision: "Repair verified defect", next_action: "Return to CR before testing" }];
    await show(source);
    await delay(60);
    const repairing = await show();
    assert.ok(elapsed(repairing) >= 20, `${state} must count explicitly active repair work`);
    assert.equal(elapsed(repairing), roleElapsed(repairing, "dev"));
    const stoppedRepair = structuredClone(source);
    stoppedRepair.role_details.dev.status = "pending";
    const repairWaiting = await show(stoppedRepair);
    await delay(60);
    assert.deepEqual(await show(), repairWaiting, `${state} must remain frozen when no repair role is active`);
  }

  const pureId = "qa-elapsed-pure-pause";
  await show(task(pureId, "dev_in_progress", { dev: "running" }));
  const beforePurePause = performance.now();
  const purePause = { view_id: pureId, state: "paused" };
  assert.deepEqual(await show(purePause), purePause, "a pure pause snapshot must retain its original shape");
  const pauseRoundTrip = performance.now() - beforePurePause;
  await delay(Math.max(100, pauseRoundTrip * 4));
  const afterPurePause = await show(task(pureId, "paused", { dev: "pending" }));
  assert.ok(elapsed(afterPurePause) < pauseRoundTrip * 2 + 50, "a pure pause must stop an existing timer before the waiting interval");
  const pureActive = await first.request({ snapshot: { view_id: pureId, state: "dev_in_progress" } });
  assert.equal(pureActive.error?.code, -32602, "an observed task cannot resume through a pure snapshot");
  await delay(60);
  assert.deepEqual(await show(), afterPurePause, "rejected pure active snapshots must not invent a role or restart a timer");

  const beforeOversized = await show();
  const oversized = task("qa-elapsed-oversized", "dev_in_progress", { dev: "running" });
  oversized.padding = "x".repeat(200 * 1024 - Buffer.byteLength(JSON.stringify({ ...oversized, padding: "" }), "utf8"));
  assert.equal(Buffer.byteLength(JSON.stringify(oversized), "utf8"), 200 * 1024);
  const rejectedOversized = await first.request({ snapshot: oversized });
  assert.equal(rejectedOversized.error?.code, -32602, "elapsed enrichment must not exceed the public snapshot size limit");
  assert.match(rejectedOversized.error.message, /200 KiB/);
  assert.deepEqual(await show(), beforeOversized, "a rejected oversized update must not replace the latest snapshot");

  const nearFrame = task("qa-elapsed-frame-limit", "planned", {}, { elapsed_ms: 0 });
  nearFrame.work_unit.roles = [];
  nearFrame.padding = "x".repeat(200 * 1024 - 200 - Buffer.byteLength(JSON.stringify({ ...nearFrame, padding: "" }), "utf8"));
  const frameRequest = { jsonrpc: "2.0", id: "", method: "tools/call", params: { name: "show_sc_task_view", arguments: { snapshot: nearFrame } } };
  const longId = "r".repeat(256 * 1024 - 1 - Buffer.byteLength(JSON.stringify(frameRequest), "utf8"));
  frameRequest.id = longId;
  assert.ok(Buffer.byteLength(JSON.stringify(frameRequest), "utf8") < 256 * 1024, "response limit case must be a valid-sized request");
  const candidateFrame = { jsonrpc: "2.0", id: longId, result: { content: [{ type: "text", text: "SC Agent Tree 已更新。" }], structuredContent: { snapshot: nearFrame } } };
  assert.ok(Buffer.byteLength(JSON.stringify(candidateFrame) + "\n", "utf8") > 256 * 1024, "response envelope must exceed the frame limit independently of snapshot size");
  const rejectedFrame = await first.request({ snapshot: nearFrame }, longId);
  assert.equal(rejectedFrame.error?.code, -32603, "oversized tool responses must reject before committing timer state");
  assert.match(rejectedFrame.error.message, /256 KiB/);
  assert.deepEqual(await show(), beforeOversized, "an oversized response must not replace the latest snapshot");

  let last;
  while (knownViews.size < 128) last = await show(task(`qa-elapsed-capacity-${knownViews.size}`, "planned", {}));
  const rejected = await first.request({ snapshot: task("qa-elapsed-over-capacity", "planned", {}) });
  assert.equal(rejected.error?.code, -32000, "a full timer session must reject new views explicitly");
  assert.match(rejected.error.message, /capacity/i);
  assert.deepEqual(await show(), last, "a rejected view must not replace the previous snapshot");
  assert.equal(elapsed(await show(task(a, "workflow_ready", { dev: "passed", cr: "passed", qa: "passed" }))), elapsed(finished), "capacity rejection must preserve existing timer records");

  const second = client();
  const restarted = await second.show(task(a, "planned", {}));
  assert.equal(elapsed(restarted), 0, "a fresh server session must not claim to restore the old session's time");
  for (const session of clients) session.complete();
  console.log("SC automatic elapsed stdio integration passed (pause, resume, serial handoff, invalid-input isolation, view isolation and capacity).");
}

main().catch(error => {
  for (const session of clients) session.complete();
  console.error(error);
  process.exitCode = 1;
});
