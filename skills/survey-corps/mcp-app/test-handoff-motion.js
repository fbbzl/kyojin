"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const template = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");
const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
let reduced = false;
const context = { window: {}, matchMedia: () => ({ matches: reduced }) };
// Exercise the actual private implementation without adding a production test API.
vm.runInNewContext(script.replace(/\}\)\(\);\s*$/, "window.testMotion={observeHandoff,animateHandoff,stateText};})();"), context);
const { observeHandoff, animateHandoff, stateText } = context.window.testMotion;
const selected = ["dev", "cr", "qa"];
const handoff = (id = "h1", fields = {}) => ({ handoff_id: id, from: "dev", to: "cr", handoff_result: "accepted", work_unit_id: "unit-a", ...fields });
const snapshot = (handoffs = [], fields = {}) => ({ view_id: "sc-task-view:unit-a", state: "ready_for_cr", work_unit: { work_unit_id: "unit-a" }, role_details: { cr: { status: "running" }, dev: { status: "passed" } }, handoffs, ...fields });
const baseline = () => observeHandoff(undefined, snapshot(), selected);
const observe = (previous, input) => observeHandoff(previous, input, selected);
const empty = baseline();
const first = observe(undefined, snapshot([handoff()]));
assert.equal(first.event, null, "first mounting must only establish a history baseline");
assert.equal(observe(empty, snapshot([handoff()])).event.id, "h1", "one new accepted handoff may animate");
assert.equal(observe(first, snapshot([handoff()])).event, null, "an identical snapshot must not replay");
assert.equal(observe(undefined, snapshot([handoff()])).event, null, "a second root starts with a static baseline");
const otherTask = observe(first, snapshot([], { view_id: "sc-task-view:unit-b" }));
assert.equal(observe(otherTask, snapshot([handoff()])).event, null, "A -> B -> A must not replay restored history");

const pending = observe(empty, snapshot([handoff("h1", { handoff_result: "pending" })]));
assert.equal(pending.event, null);
const accepted = observe(pending, snapshot([handoff()]));
assert.equal(accepted.event.id, "h1", "the same final pending event can be accepted once");
const regressed = observe(accepted, snapshot([handoff("h1", { handoff_result: "pending" })]));
assert.equal(observe(regressed, snapshot([handoff()])).event, null, "accepted IDs remain consumed after history regression");
const stripped = observe(first, snapshot([]));
assert.equal(observe(stripped, snapshot([handoff()])).event, null, "removing and restoring an observed ID must not replay it");

for (const state of ["paused", "waiting", "blocked", "needs_user_confirm", "qa_passed", "workflow_ready", "done", "failed", "cancelled"]) {
  const stopped = observe(empty, snapshot([handoff()], { state }));
  assert.equal(stopped.event, null, state);
  assert.equal(observe(stopped, snapshot([handoff()])).event, null, `${state} must consume the accepted ID`);
}
for (const status of [undefined, "pending", "passed", "blocked", "needs_user_confirm", "waiting", "paused", "preparing", "in_progress", "completed", " RUNNING "]) {
  const notRunning = observe(empty, snapshot([handoff()], { role_details: { cr: { status } } }));
  assert.equal(notRunning.event, null, String(status));
  assert.equal(observe(notRunning, snapshot([handoff()])).event, null, "later running must not backfill an animation");
}
assert.equal(observe(empty, snapshot([handoff()], { role_details: { cr: { status: "running" } } })).event.id, "h1");
assert.equal(stateText("ready_for_cr"), "审查阶段");
assert.equal(stateText("ready_for_qa"), "测试阶段");
for (const status of ["pending", "running", "blocked", "needs_user_confirm", undefined]) {
  const qaHandoff = handoff("qa-start", { from: "cr", to: "qa" });
  const invalid = observe(empty, snapshot([qaHandoff], { role_details: { cr: { status }, qa: { status: "running" } } }));
  assert.equal(invalid.event, null, "QA handoff requires passed CR: " + String(status));
  const legal = snapshot([qaHandoff], { role_details: { cr: { status: "passed" }, qa: { status: "running" } } });
  assert.equal(observe(invalid, legal).event, null, "opening the CR gate must not replay the consumed QA handoff");
  assert.equal(observe(empty, legal).event?.to, "qa", "a fresh legal CR to QA handoff may animate");
}
assert.equal(observeHandoff(empty, snapshot([handoff("qa-only", { from: "dev", to: "qa" })], { role_details: { cr: { status: "passed" }, qa: { status: "running" } } }), ["dev", "qa"]).event, null, "omitted CR cannot authorize a QA handoff");
for (const status of ["running"]) {
  for (const role of ["dev", "qa"]) {
    const conflict = observe(empty, snapshot([handoff()], { role_details: { cr: { status: "running" }, [role]: { status } } }));
    assert.equal(conflict.event, null, role + " " + status + " conflicts with the receiving role");
    assert.equal(observe(conflict, snapshot([handoff()])).event, null, "resolving activity conflicts must not backfill motion");
    assert.equal(observe(conflict, snapshot([handoff(), handoff("h2")])).event.id, "h2", "a later legal handoff still animates");
  }
}
assert.equal(observe(empty, snapshot([handoff("h1", { handoff_result: "rejected" })])).event, null);
assert.equal(observe(empty, snapshot([handoff("h1", { handoff_result: "needs_revision" })])).event, null);
assert.equal(observe(empty, snapshot([handoff("", {})])).event, null, "legacy ID-less snapshots remain static");
assert.equal(observe(empty, snapshot([handoff("h1", { work_unit_id: "different" })])).event, null);
for (const work_unit_id of [undefined, 42, null, "", "   ", {}, [], false]) {
  const invalidUnit = observe(empty, snapshot([handoff("h1", { work_unit_id })]));
  assert.equal(invalidUnit.event, null, `explicit invalid work_unit_id ${String(work_unit_id)} must not animate`);
  assert.equal(observe(invalidUnit, snapshot([handoff()])).event, null, "correcting an accepted record must not backfill motion");
}
assert.equal(observe(empty, snapshot([handoff("h1", { work_unit_id: "unit-a" })])).event.id, "h1");
const legacyUnit = handoff(); delete legacyUnit.work_unit_id;
assert.equal(observe(empty, snapshot([legacyUnit])).event.id, "h1", "a truly omitted work_unit_id remains compatible");
const legacyPending = { ...legacyUnit, handoff_result: "pending" };
const legacyPendingObservation = observe(empty, snapshot([legacyPending]));
assert.equal(observe(legacyPendingObservation, snapshot([handoff("h1", { work_unit_id: null })])).event, null, "omitted-to-explicit invalid history is a rewrite");
const explicitPending = observe(empty, snapshot([handoff("h1", { work_unit_id: null, handoff_result: "pending" })]));
assert.equal(observe(explicitPending, snapshot([legacyUnit])).event, null, "explicit invalid-to-omitted history is a rewrite");
assert.equal(observe(explicitPending, snapshot([handoff()])).event, null, "correcting the unit while accepting is a history rewrite");
assert.equal(observe(empty, snapshot([handoff("h1", { to: "qa" })], { role_details: { qa: { status: "running" } } })).event, null, "a cross-role jump must stay static");
assert.equal(observeHandoff(empty, snapshot([handoff()]), ["dev", "qa"]).event, null, "unselected recipients cannot animate");
assert.equal(observe(empty, snapshot([handoff("h1"), handoff("h2")])).event, null, "a batch history append must stay static");
assert.equal(observe(first, snapshot([handoff(), handoff()])).event, null, "duplicate IDs cannot trigger motion");
assert.equal(observe(first, snapshot([handoff("different"), handoff("h2")])).event, null, "rewritten history cannot trigger motion");
const reverse = observe(first, snapshot([handoff(), handoff("h2", { from: "cr", to: "dev" })], { role_details: { dev: { status: "running" } } }));
assert.equal(reverse.event.to, "dev", "an adjacent return handoff remains observable");
for (const invalid of [undefined, null, {}, "history", [null], [42], [[]]]) {
  const sample = snapshot(); sample.handoffs = invalid;
  const observed = observe(first, sample);
  assert.equal(observed.event, null);
}
const omitted = observe(first, snapshot(undefined, { handoffs: undefined }));
assert.equal(observe(omitted, snapshot([handoff(), handoff("h2")])).event, null, "returning from an omitted history establishes a new static baseline");
assert.equal(observe(empty, snapshot([handoff()], { view_id: "" })).event, null);

function node(dataset = {}, classes = []) {
  const target = new EventTarget(), values = new Set(classes);
  target.dataset = dataset;
  target.offsetWidth = 12;
  target.classList = { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name), toggle: (name, enabled) => enabled ? values.add(name) : values.delete(name) };
  return target;
}
const connector = node({ scConnectorFrom: "dev", scConnectorTo: "cr" });
const receiver = node({}, ["is-active"]);
const root = { querySelectorAll: () => [connector], querySelector: () => receiver };
animateHandoff(root, reverse.event);
assert.ok(connector.classList.contains("is-handoff-flow"));
assert.ok(connector.classList.contains("is-handoff-reverse"));
assert.ok(receiver.classList.contains("is-handoff-receiving"));
connector.dispatchEvent(new Event("animationend"));
assert.ok(!connector.classList.contains("is-handoff-flow"));
assert.ok(!connector.classList.contains("is-handoff-reverse"), "reverse arrow must reset when flow ends");
receiver.dispatchEvent(new Event("animationend"));
assert.ok(!receiver.classList.contains("is-handoff-receiving"));
assert.ok(receiver.classList.contains("is-active"), "handoff feedback must preserve the running pulse");
animateHandoff(root, reverse.event);
connector.dispatchEvent(new Event("animationcancel"));
assert.ok(!connector.classList.contains("is-handoff-reverse"), "reverse arrow must also reset on cancellation");
animateHandoff(root, reverse.event);
animateHandoff(root, null);
assert.ok(!connector.classList.contains("is-handoff-flow"));
assert.ok(!receiver.classList.contains("is-handoff-receiving"), "the next snapshot must clean up transient effects");
reduced = true;
const reducedObservation = observe(empty, snapshot([handoff()]));
animateHandoff(root, reducedObservation.event);
assert.ok(!connector.classList.contains("is-handoff-flow"));
assert.ok(!receiver.classList.contains("is-handoff-receiving"));
reduced = false;
assert.equal(observe(reducedObservation, snapshot([handoff()])).event, null, "leaving reduced motion must not replay the accepted ID");

console.log("SC handoff motion implementation units passed.");
