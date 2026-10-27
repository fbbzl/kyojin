"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  const skillPath = path.join(__dirname, "..", "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    assert.ok(!fs.existsSync(path.resolve(__dirname, "../../..", ".agents/plugins/marketplace.json")), "source Skill is missing");
    console.log("Snapshot helper test skipped outside the source tree.");
    return;
  }
  const skill = fs.readFileSync(skillPath, "utf8"), fence = String.fromCharCode(96).repeat(3);
  const example = skill.split("### 快照更新与输出")[1].split(fence + "javascript")[1].split(fence)[0];
  const saved = new Map(), calls = [], output = [];
  let mode = "ok";
  const copy = value => JSON.parse(JSON.stringify(value));
  const context = vm.createContext({
    store: (key, value) => saved.set(key, copy(value)), load: key => saved.get(key), text: value => output.push(value),
    tools: { mcp__survey_corps_task_view__show_sc_task_view: async ({ snapshot }) => {
      calls.push(copy(snapshot));
      if (mode === "throw") throw new Error("transport failed");
      if (mode === "error") return { isError: true, content: [{ type: "text", text: "rejected" }] };
      const accepted = copy(snapshot);
      accepted.work_unit.metrics = { elapsed_ms: calls.length };
      if (mode === "mismatch") accepted.view_id = "other";
      return { content: [{ type: "text", text: "updated" }], structuredContent: { snapshot: accepted } };
    } },
  });
  vm.runInContext(example.slice(0, example.indexOf("// 后续调用")), context);
  const update = vm.runInContext("eval(load('sc-update'))", context);
  const initial = { view_id: "A", state: "dev_in_progress", work_unit: { roles: ["dev"], git: { repository: "kyojin", branch: "main" } }, role_details: { dev: { status: "running", file_activity: { current: "D:/work/a.js" } } }, handoffs: [{ handoff_id: "history" }] };
  const original = copy(initial);
  await update("A", () => {}, initial);
  for (let i = 0; i < 4; i++) await update("A", () => {});
  assert.equal(calls.length, 1, "same-view no-ops must not call the MCP tool");
  assert.deepEqual(output, ["updated"], "no-ops must produce neither confirmations nor snapshot output");
  assert.deepEqual(initial, original, "the caller's initial snapshot must remain unchanged");
  await update("A", value => { value.role_details.dev.file_activity.current = "D:/work/b.js"; value.role_details.dev.summary = "changed"; });
  assert.equal(calls.length, 2, "one action must send its changed fields together");
  assert.deepEqual(calls[1].work_unit.git, initial.work_unit.git);
  assert.deepEqual(calls[1].handoffs, initial.handoffs, "full history must survive updates");
  assert.equal(calls[1].work_unit.metrics.elapsed_ms, 1, "updates must use the server-accepted cache");
  await update("A", value => { value.state = "needs_user_confirm"; value.role_details.dev.status = "needs_user_confirm"; });
  assert.equal(calls.length, 3, "state transitions must not be skipped");
  const other = { ...copy(initial), view_id: "B" };
  await update("B", () => {}, other);
  await update("A", () => {});
  assert.equal(calls.length, 5, "returning to a cached view must still show that view");
  await update("A", () => {}, saved.get("sc-snapshot:A"));
  assert.equal(calls.length, 6, "explicit restore or server restart must allow a forced send");
  for (const failure of ["error", "mismatch", "throw"]) {
    mode = failure;
    const before = copy(saved.get("sc-snapshot:A")), count = calls.length;
    await assert.rejects(update("A", value => { value.role_details.dev.summary = "unaccepted"; }));
    assert.deepEqual(saved.get("sc-snapshot:A"), before, "failed updates must not overwrite accepted state");
    assert.equal(saved.get("sc-current-view"), null, "failure must invalidate no-op suppression");
    mode = "ok";
    await update("A", () => {});
    assert.equal(calls.length, count + 2, "a retry must send even unchanged cached state");
  }
  const count = calls.length;
  await assert.rejects(update("missing", () => {}));
  await assert.rejects(update("wrong", () => {}, initial));
  assert.equal(calls.length, count, "missing or mismatched caches must fail before calling the tool");
  console.log("Snapshot helper regression passed: no-op, full updates, switching, force, cache and failure handling.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
