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

function node(dataset = {}, classes = [], bounds = { left: 0, top: 0, width: 180, height: 60 }) {
  const target = new EventTarget(), values = new Set(), attributes = new Map();
  target.dataset = dataset; target.offsetWidth = 12; target.children = []; target.isConnected = true;
  target.classList = { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name), toggle: (name, enabled) => enabled ? values.add(name) : values.delete(name) };
  classes.forEach(name => target.classList.add(name));
  target.setAttribute = (name, value) => attributes.set(name, String(value));
  target.getAttribute = name => attributes.get(name) ?? null;
  target.getBoundingClientRect = () => bounds;
  target.append = child => { target.children.push(child); child.parentNode = target; };
  target.remove = () => { if (target.parentNode) target.parentNode.children.splice(target.parentNode.children.indexOf(target), 1); target.parentNode = null; };
  return target;
}
const observers = [];
context.document = { createElementNS: (_namespace, tag) => Object.assign(node(), { tagName: tag }) };
context.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnected = false; observers.push(this); }
  observe(target) { this.targets.add(target); }
  disconnect() { this.disconnected = true; this.targets.clear(); }
};
const connector = node({ scConnectorFrom: "dev", scConnectorTo: "cr" });
const receiver = node({}, ["is-active"], { left: 0, top: 100, width: 180, height: 80 });
const source = node({}, [], { left: 0, top: 230, width: 180, height: 60 });
const lane = node({}, [], { left: 0, top: 100, width: 180, height: 500 });
const root = { querySelectorAll: () => [connector], querySelector: selector => selector === ".sc-task-view__role-lane" ? lane : selector.includes('"dev"') ? receiver : source };
const currentReturn = () => lane.children[0], currentLight = () => currentReturn()?.children[1];
function assertReturn() {
  assert.equal(connector.classList.contains("is-handoff-flow"), false, "return must not animate the down arrow");
  assert.equal(lane.children.length, 1); assert.equal(currentReturn().getAttribute("aria-hidden"), "true");
  assert.equal(currentReturn().getAttribute("focusable"), "false");
  assert.equal(currentLight().getAttribute("pathLength"), "100");
  assert.equal(currentLight().getAttribute("d"), currentReturn().children[0].getAttribute("d"));
  assert.equal(currentLight().classList.contains("is-handoff-return-flow"), true);
  assert.equal(receiver.classList.contains("is-handoff-receiving"), true);
  assert.equal(observers.at(-1).targets.size, 3, "only the lane and two participant cards are observed");
}
animateHandoff(root, reverse.event); assertReturn();
const firstObserver = observers.at(-1); currentLight().dispatchEvent(new Event("animationend"));
assert.equal(lane.children.length, 0); assert.equal(firstObserver.disconnected, true);
receiver.dispatchEvent(new Event("animationend"));
assert.equal(receiver.classList.contains("is-handoff-receiving"), false);
assert.equal(receiver.classList.contains("is-active"), true, "receiver retains its running pulse after finite feedback");
animateHandoff(root, reverse.event); assertReturn();
const cancelledObserver = observers.at(-1); currentLight().dispatchEvent(new Event("animationcancel"));
assert.equal(lane.children.length, 0); assert.equal(cancelledObserver.disconnected, true);
animateHandoff(root, reverse.event); const updatedObserver = observers.at(-1); animateHandoff(root, null);
assert.equal(lane.children.length, 0); assert.equal(updatedObserver.disconnected, true);
assert.equal(receiver.classList.contains("is-handoff-receiving"), false, "next snapshot clears receiver feedback");
const observerCount = observers.length;
animateHandoff(root, { from: "dev", to: "cr" });
assert.equal(connector.classList.contains("is-handoff-flow"), true, "forward handoff retains its down-arrow animation");
assert.equal(lane.children.length, 0); assert.equal(observers.length, observerCount);
connector.dispatchEvent(new Event("animationcancel"));
assert.equal(connector.classList.contains("is-handoff-flow"), false);
animateHandoff(root, null);
reduced = true;
const reducedObservation = observe(empty, snapshot([handoff()]));
animateHandoff(root, reducedObservation.event); animateHandoff(root, reverse.event);
assert.equal(lane.children.length, 0); assert.equal(observers.length, observerCount);
assert.equal(connector.classList.contains("is-handoff-flow"), false);
assert.equal(receiver.classList.contains("is-handoff-receiving"), false);
reduced = false;
assert.equal(observe(reducedObservation, snapshot([handoff()])).event, null, "leaving reduced motion never backfills an accepted ID");

console.log("SC handoff observation and finite forward/return lifecycle checks passed.");
