"use strict";
const assert = require("node:assert/strict");
const { createElapsedTracker, workflowError } = require("./elapsed-tracker");

let time = 0;
const tracker = createElapsedTracker({ now: () => time });
const sample = (view_id, state, statuses, metrics) => ({ view_id, state, work_unit: { roles: Object.keys(statuses), metrics }, role_details: Object.fromEntries(Object.entries(statuses).map(([role, status]) => [role, { status }])) });
const elapsed = snapshot => snapshot.work_unit.metrics.elapsed_ms;
const roleElapsed = (snapshot, role) => snapshot.role_details[role].metrics.elapsed_ms;
const initial = sample("serial", "planned", { req: "running", dev: "pending" });
const original = structuredClone(initial);
assert.equal(elapsed(tracker.update(initial)), 0);
assert.deepEqual(initial, original, "enhancement must not mutate the caller snapshot");
time = 1000;
let result = tracker.update(initial);
assert.equal(elapsed(result), 1000);
assert.equal(roleElapsed(result, "req"), 1000);
assert.equal(roleElapsed(result, "dev"), 0, "pending roles must not count another role's activity");
time = 1250;
result = tracker.update(sample("serial", "needs_user_confirm", { req: "running", dev: "pending" }));
assert.equal(elapsed(result), 1250);
time = 5250;
assert.equal(elapsed(tracker.update(result)), 1250, "global waiting freezes stale running roles");
result = tracker.update(sample("serial", "planned", { req: "passed", dev: "running" }));
time = 5750;
result = tracker.update(sample("serial", "workflow_ready", { req: "passed", dev: "running" }));
assert.equal(elapsed(result), 1750);
assert.equal(roleElapsed(result, "req"), 1250);
assert.equal(roleElapsed(result, "dev"), 500);
time = 9000;
assert.equal(elapsed(tracker.update(result)), 1750, "completion freezes stale active status");

for (const state of ["passed", "qa_success", "skipped"]) {
  let now = 0;
  const clock = createElapsedTracker({ now: () => now });
  const running = sample("end:" + state, "planned", { dev: "running" });
  clock.update(running); now = 100;
  const finished = clock.update({ ...running, state }); now = 500;
  assert.equal(elapsed(clock.update(finished)), 100, state + " must freeze task elapsed");
  assert.equal(roleElapsed(clock.update(finished), "dev"), 100);
}
const outOfOrder = sample("order", "dev_in_progress", { cr: "pending", dev: "running", qa: "pending" });
assert.match(workflowError(outOfOrder), /preceding role cr/);
tracker.update(outOfOrder); time += 50;
assert.equal(elapsed(tracker.update(outOfOrder)), 0, "out-of-order snapshots must not accrue time");
const repair = sample("repair", "cr_blocked", { cr: "blocked", dev: "passed", qa: "running" });
Object.assign(repair.work_unit, { work_unit_id: "repair", reference_version: "v1" });
repair.role_details.cr.blocker_type = "test_assets";
repair.handoffs = [{ work_unit_id: "repair", reference_version: "v1", from: "cr", to: "qa", state: "cr_blocked", handoff_result: "accepted", files: ["test.js"], decision: "Repair test asset only", next_action: "Return to CR before testing" }];
assert.equal(workflowError(repair), null);
tracker.update(repair); time += 25;
assert.equal(roleElapsed(tracker.update(repair), "qa"), 25, "scoped repair counts as QA work");
for (const change of [value => { value.handoffs = []; }, value => { value.handoffs[0].reference_version = "old"; }, value => { value.handoffs[0].files = []; }, value => { value.role_details.cr.blocker_type = "bug"; }]) {
  const invalid = structuredClone(repair); change(invalid);
  assert.ok(workflowError(invalid), "incomplete or stale repair handoffs must not authorize QA");
}

const seeded = sample("seeded", "planned", { dev: "running" }, { elapsed_ms: 2000, total_tokens: 99 });
seeded.role_details.dev.metrics = { elapsed_ms: 1500 };
assert.equal(elapsed(tracker.update(seeded)), 2000);
time += 1000;
result = tracker.update(seeded);
assert.equal(elapsed(result), 3000, "replayed seeds must never reset cumulative elapsed");
assert.equal(roleElapsed(result, "dev"), 2500);
assert.equal(result.work_unit.metrics.total_tokens, 99, "legacy metadata remains compatible without presentation");
time -= 500;
assert.equal(elapsed(tracker.update(seeded)), 3000, "clock rollback must not subtract elapsed");
time += 500;
assert.equal(elapsed(tracker.update(seeded)), 3000, "a rolled-back clock must not count a repeated interval");

for (const missing of [undefined, null, ""]) {
  const explicitQa = sample("explicit-qa:" + String(missing), "dev_in_progress", { dev: missing, cr: "passed", qa: "running" });
  tracker.update(explicitQa);
  time += 25;
  result = tracker.update(explicitQa);
  assert.equal(roleElapsed(result, "dev"), 0, "task state must not start DEV without running status");
  assert.equal(roleElapsed(result, "qa"), 25);
  assert.equal(elapsed(result), 25);
}
for (const role of ["req", "dev", "cr", "qa"]) {
  const running = sample("running:" + role, "planned", role === "qa" ? { cr: "passed", qa: "running" } : { [role]: "running" });
  tracker.update(running);
  time += 25;
  assert.equal(roleElapsed(tracker.update(running), role), 25, "each selected running role must count");
  running.role_details[role].status = "pending";
  tracker.update(running);
  time += 25;
  assert.equal(elapsed(tracker.update(running)), 25, "leaving running settles and freezes the interval");
}
for (const status of ["pending", "running", "blocked", "needs_user_confirm", undefined]) {
  const gated = sample("gated-qa:" + String(status), "ready_for_qa", { cr: status, qa: "running" });
  const original = structuredClone(gated);
  tracker.update(gated);
  time += 50;
  result = tracker.update(gated);
  assert.equal(elapsed(result), 0, "QA must not count before CR passes: " + String(status));
  assert.equal(roleElapsed(result, "qa"), 0);
  assert.equal(roleElapsed(result, "cr"), 0, "conflicting running roles must not count");
  assert.deepEqual(gated, original, "gating must not rewrite the caller's role states");
  gated.role_details.cr.status = "passed";
  tracker.update(gated);
  time += 25;
  assert.equal(roleElapsed(tracker.update(gated), "qa"), 25, "CR passing opens QA timing from that observation only");
}
const unselectedCr = sample("qa-scalar", "ready_for_qa", { cr: "passed", qa: "running" });
unselectedCr.work_unit.roles = " QA ";
tracker.update(unselectedCr);
time += 50;
assert.equal(elapsed(tracker.update(unselectedCr)), 0, "an unselected CR must not authorize scalar QA");
const missingCr = sample("qa-missing-cr", "ready_for_qa", { qa: "running" });
missingCr.work_unit.roles = ["cr", "qa"];
tracker.update(missingCr);
time += 50;
assert.equal(elapsed(tracker.update(missingCr)), 0, "missing CR details must not authorize QA");
const conflict = sample("conflict", "planned", { req: "running", dev: "running" });
tracker.update(conflict);
time += 50;
assert.equal(elapsed(tracker.update(conflict)), 0, "multiple active roles must not start task timing");
for (const value of [undefined, null, "", " RUNNING ", "RUNNING", "passed", "blocked", "needs_user_confirm", "preparing", "in_progress", "working", "active", "started", "started_working"]) {
  const idle = sample("not-running:" + String(value), "dev_in_progress", { dev: value });
  tracker.update(idle);
  time += 25;
  assert.equal(elapsed(tracker.update(idle)), 0, "only running starts a timer: " + String(value));
}
const explicitPending = sample("pending", "dev_in_progress", { dev: "pending" });
tracker.update(explicitPending);
time += 25;
assert.equal(elapsed(tracker.update(explicitPending)), 0, "pending role status must not start a timer");
const unknown = sample("unknown", "mystery", { dev: "mystery" });
tracker.update(unknown);
time += 25;
assert.equal(elapsed(tracker.update(unknown)), 0, "unknown status must not invent an activity interval");
for (const state of ["cr_blocked", "qa_failed", "qa_conditional"]) {
  const revision = sample("revision:" + state, state, { dev: "running" });
  tracker.update(revision);
  time += 100;
  result = tracker.update(revision);
  assert.equal(elapsed(result), 100, "explicit repair activity must count under " + state);
  assert.equal(roleElapsed(result, "dev"), 100);
  revision.role_details.dev.status = "pending";
  tracker.update(revision);
  time += 100;
  assert.equal(elapsed(tracker.update(revision)), 100, "repair state alone must not invent activity");
}
const malformed = sample("malformed", "planned", { dev: "pending" }, { elapsed_ms: -1 });
malformed.role_details.dev.metrics = { elapsed_ms: 2.5 };
assert.equal(elapsed(tracker.update(malformed)), 0);
assert.equal(roleElapsed(tracker.update(malformed), "dev"), 0);

const selection = sample("selection", "planned", { dev: "running", qa: "running" });
selection.work_unit.roles = [" DEV ", "dev", "bad"];
tracker.update(selection);
time += 20;
result = tracker.update(selection);
assert.equal(roleElapsed(result, "dev"), 20);
assert.equal(result.role_details.qa.metrics, undefined, "unselected roles must not get a timer");
selection.work_unit.roles = [];
tracker.update(selection);
time += 100;
selection.work_unit.roles = ["dev"];
assert.equal(roleElapsed(tracker.update(selection), "dev"), 20, "deselection stops the role until reselected");

let capacityTime = 0;
const bounded = createElapsedTracker({ now: () => capacityTime, maxViews: 1 });
const active = sample("kept", "planned", { dev: "running" });
bounded.update(active);
assert.throws(() => bounded.update(sample("extra", "planned", {})), /capacity reached/);
capacityTime = 500;
assert.equal(bounded.update(sample("kept", "paused", { dev: "running" }), () => false), null);
capacityTime = 1000;
assert.equal(elapsed(bounded.update(active)), 1000, "rejected output must not pause the accepted task");
const empty = { view_id: "legacy", state: "planned" };
assert.equal(bounded.update(empty), empty, "pure view snapshots are preserved and consume no timer capacity");
capacityTime = 1200;
const purePause = { view_id: "kept", state: "paused" };
assert.equal(bounded.update(purePause), purePause, "pure stop snapshots remain structurally unchanged");
capacityTime = 5000;
bounded.update({ view_id: "kept", state: "dev_in_progress" });
assert.equal(elapsed(bounded.update(sample("kept", "planned", { dev: "pending" }))), 1200, "pure non-stop snapshots cannot resume paused timers");
bounded.update(active);
capacityTime = 5500;
assert.equal(bounded.update({ view_id: "kept", state: "completed" }, () => false), null);
capacityTime = 6000;
assert.equal(elapsed(bounded.update(active)), 2200, "rejected pure stop must not change active intervals");
bounded.update({ view_id: "kept", state: "completed" });
capacityTime = 9000;
assert.equal(roleElapsed(bounded.update(sample("kept", "planned", { dev: "pending" })), "dev"), 2200, "pure completion stops role and task timers");

const saturated = createElapsedTracker({ now: () => time });
const maximum = sample("max", "planned", { dev: "running" }, { elapsed_ms: Number.MAX_SAFE_INTEGER });
saturated.update(maximum);
time += 100;
assert.equal(elapsed(saturated.update(maximum)), Number.MAX_SAFE_INTEGER, "elapsed must stay inside the schema integer range");
assert.equal(elapsed(createElapsedTracker({ now: () => time }).update(initial)), 0, "a new server session has no unsaved history");
console.log("SC elapsed tracker unit tests passed.");
