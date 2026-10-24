"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { startServer } = require("./test-stdio-helper");

const template = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");
const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = { window: {} };
vm.runInNewContext(script.replace(/\}\)\(\);\s*$/, "window.serialUnits={roleStatus,roleStates,resolveActiveRole};})();"), context);
const { roleStatus, roleStates, resolveActiveRole } = context.window.serialUnits;
const roleStatusText = value => roleStatus(value).label;

assert.equal(roleStatusText("running"), "进行中");
assert.equal(roleStatusText(" RUNNING "), "未知状态");
assert.equal(roleStatusText("waiting"), "未知状态");
const statuses = ["pending", "running", "passed", "blocked", "needs_user_confirm"];
assert.deepEqual(Object.keys(roleStates), statuses);
for (const [status, label] of Object.entries({pending:"待开始",running:"进行中",passed:"通过",blocked:"阻断",needs_user_confirm:"待用户确认"})) assert.equal(roleStatusText(status), label);
for (const status of ["completed", "failed", "preparing", "working", "active", "in_progress", "waiting_user", "skipped", "paused", "cancelled"]) assert.equal(roleStatusText(status), "未知状态");
assert.equal(roleStatusText(undefined), "状态未提供");
assert.doesNotMatch(template, /rolePhases|rolePhaseText|预审中|测试准备中|等待审查通过|测试中/);
assert.match(template, /state=roleStatus\(detail\.status\)/, "role title must render from status only");

const details = { dev: { status: "passed" }, cr: { status: "running" }, qa: { status: "pending" } };
assert.equal(resolveActiveRole(details, "ready_for_cr", ["dev", "cr", "qa"]), "cr");
details.qa = { status: "running" };
assert.equal(resolveActiveRole(details, "ready_for_cr", ["dev", "cr", "qa"]), null, "multiple active roles must not be highlighted");
details.qa = { status: "pending" };
details.cr = { status: "pending" };
details.dev = {};
assert.equal(resolveActiveRole(details, "dev_in_progress", ["dev", "cr", "qa"]), null, "task state must not infer an active role");
for (const status of ["pending", "running", "blocked", "needs_user_confirm", undefined]) {
  const gated = { dev: { status: "passed" }, cr: { status }, qa: { status: "running" } };
  const original = structuredClone(gated);
  assert.equal(resolveActiveRole(gated, "ready_for_qa", ["dev", "cr", "qa"]), null, "QA requires passed CR: " + String(status));
  assert.deepEqual(gated, original, "render gating must preserve authoritative role states");
}
const qaReady = { cr: { status: "passed" }, qa: { status: "running" } };
assert.equal(resolveActiveRole(qaReady, "ready_for_qa", ["cr", "qa"]), "qa");
assert.equal(resolveActiveRole({ qa: qaReady.qa }, "ready_for_qa", ["cr", "qa"]), null, "missing CR details must suppress QA");
assert.equal(resolveActiveRole(qaReady, "ready_for_qa", ["qa"]), null, "unselected passed CR must not authorize QA");

const accepted = {
  view_id: "serial-status-regression",
  state: "ready_for_cr",
  work_unit: { work_unit_id: "serial-status-regression", roles: ["dev", "cr", "qa"] },
  role_details: { dev: { status: "passed" }, cr: { status: "running", summary: "CR active" }, qa: { status: "pending" } },
};
const conflict = structuredClone(accepted);
conflict.role_details.qa.status = "running";

async function serverContract() {
  let requestId = 0;
  const pending = new Map();
  const session = startServer({ timeoutMs: 5000, onReply(reply) {
    const request = pending.get(reply.id);
    assert.ok(request, "unexpected stdio response");
    pending.delete(reply.id);
    request.resolve(reply);
  } });
  const request = (method, params) => {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      session.server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };
  const call = args => request("tools/call", { name: "show_sc_task_view", arguments: args });
  try {
    const first = await call({ snapshot: accepted });
    assert.equal(first.error, undefined);
    const rejected = await call({ snapshot: conflict });
    assert.equal(rejected.error.code, -32602);
    assert.match(rejected.error.message, /only one active role/);
    const restored = await call({});
    const snapshot = restored.result.structuredContent.snapshot;
    assert.equal(snapshot.state, accepted.state);
    assert.equal(snapshot.role_details.cr.status, "running");
    assert.equal(snapshot.role_details.cr.summary, "CR active");
    assert.equal(snapshot.role_details.qa.status, "pending");
    const tools = await request("tools/list", {});
    const schema = tools.result.tools[0].inputSchema.properties.snapshot.properties.role_details.properties;
    const invalidStatuses = [null, "", " RUNNING ", "RUNNING", "in-progress", "preparing", "working", "active", "started", "started_working", "completed", "waiting", "waiting_user", "failed", "paused", "cancelled", "skipped", 0, false, {}, []];
    for (const role of ["req", "dev", "cr", "qa"]) {
      assert.deepEqual(schema[role].properties.status.enum, statuses);
      for (const status of invalidStatuses) {
        const input = { view_id: "strict-role-status", role_details: { [role]: { status } } };
        assert.equal((await call({ snapshot: input })).error.code, -32602, role + " " + JSON.stringify(status));
      }
      for (const status of statuses) assert.equal((await call({ snapshot: { view_id: "strict-role-status", role_details: { [role]: { status } } } })).error, undefined);
      assert.equal((await call({ snapshot: { view_id: "strict-role-status", role_details: { [role]: {} } } })).error, undefined);
    }
    await call({ snapshot: accepted });
    const illegalQa = ["pending", "running", "blocked", "needs_user_confirm", undefined].map(status => ({ ...structuredClone(accepted), role_details: { dev: { status: "passed" }, cr: { status }, qa: { status: "running", metrics: { elapsed_ms: 999999 } } } }));
    illegalQa.push({ ...structuredClone(accepted), role_details: { qa: { status: "running" } } });
    illegalQa.push({ ...structuredClone(accepted), work_unit: { roles: ["dev", "qa"] }, role_details: qaReady });
    illegalQa.push({ ...structuredClone(accepted), work_unit: { roles: " QA " }, role_details: qaReady });
    for (const input of illegalQa) {
      const reply = await call({ snapshot: input });
      assert.equal(reply.error?.code, -32602, "QA must not start before selected CR passes");
      assert.match(reply.error.message, /only one active role|QA can run only when selected CR has passed/);
      const kept = (await call({})).result.structuredContent.snapshot;
      assert.equal(kept.role_details.cr.status, "running", "invalid QA input must preserve cache");
      assert.equal(kept.role_details.qa.status, "pending");
      assert.equal(kept.role_details.qa.metrics.elapsed_ms, 0, "rejected QA input must not seed or start its timer");
    }
    const ready = { ...structuredClone(accepted), state: "ready_for_qa", role_details: { dev: { status: "passed" }, ...qaReady } };
    const startedQa = await call({ snapshot: ready });
    assert.equal(startedQa.error, undefined);
    assert.equal(startedQa.result.structuredContent.snapshot.role_details.qa.metrics.elapsed_ms, 0, "first legal QA activity must start from zero");
    console.log("Five-state role units, QA prerequisite and rejected snapshot cache/timer preservation passed.");
  } finally {
    session.complete();
    for (const request of pending.values()) request.reject(new Error("test session ended"));
  }
}

serverContract().catch(error => { console.error(error); process.exitCode = 1; });
