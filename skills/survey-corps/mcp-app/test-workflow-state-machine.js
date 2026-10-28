"use strict";

const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { createWorkflowStateMachine, transition } = require("./workflow-state-machine");
const { startServer } = require("./test-stdio-helper");

const roles = ["dev", "cr", "qa"];
const make = (view_id, state, statuses, extra = {}) => ({
  view_id, state, work_unit: { work_unit_id: view_id, roles, ...extra.work_unit },
  role_details: Object.fromEntries(Object.entries(statuses).map(([role, status]) => [role, { status }])),
  ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "work_unit")),
});
const event = snapshot => ({ type: "SNAPSHOT_RECEIVED", snapshot });
const rejectionError = (machine, snapshot) => machine.dispatch(event(snapshot), () => true).error;
const accepted = (machine, snapshot) => assert.equal(rejectionError(machine, snapshot), null, snapshot.state + " should be consistent");

const roleStatuses = ["pending", "running", "passed", "blocked", "needs_user_confirm"];
const heldTransitions = {
  pending: ["pending", "blocked", "needs_user_confirm"],
  running: ["pending", "passed", "blocked", "needs_user_confirm"],
  passed: ["passed"], blocked: ["pending", "blocked", "needs_user_confirm"],
  needs_user_confirm: ["pending", "blocked", "needs_user_confirm"],
};
for (const from of roleStatuses) for (const to of roleStatuses) {
  const machine = createWorkflowStateMachine(), id = "role-pair-" + from + "-" + to;
  const snapshot = (state, status) => make(id, state, { req: status }, { work_unit: { roles: ["req"] }, resume_state: "planned" });
  accepted(machine, snapshot(["blocked", "needs_user_confirm"].includes(from) ? "paused" : "planned", from));
  const error = rejectionError(machine, snapshot("paused", to));
  assert.equal(error === null, heldTransitions[from].includes(to), from + " -> " + to + " while held");
}

const reqChain = createWorkflowStateMachine();
for (const [state, statuses] of [
  ["confirmed", ["pending", "pending", "pending", "pending"]],
  ["planned", ["running", "pending", "pending", "pending"]],
  ["planned", ["passed", "pending", "pending", "pending"]],
  ["dev_in_progress", ["passed", "running", "pending", "pending"]],
  ["ready_for_cr", ["passed", "passed", "running", "pending"]],
  ["ready_for_qa", ["passed", "passed", "passed", "running"]],
  ["qa_passed", ["passed", "passed", "passed", "passed"]],
  ["workflow_ready", ["passed", "passed", "passed", "passed"]],
]) accepted(reqChain, make("req-chain", state, Object.fromEntries(["req", ...roles].map((role, index) => [role, statuses[index]])), { work_unit: { roles: ["req", ...roles] } }));

const normal = createWorkflowStateMachine();
const planned = make("normal", "planned", { dev: "pending", cr: "pending", qa: "pending" });
accepted(normal, planned);
const invalid = make("normal", "ready_for_qa", { dev: "pending", cr: "pending", qa: "running" });
assert.match(rejectionError(normal, invalid), /CR.*passed/);
const dev = make("normal", "dev_in_progress", { dev: "running", cr: "pending", qa: "pending" });
accepted(normal, dev);
const invalidDev = make("normal", "dev_in_progress", { dev: "pending", cr: "pending", qa: "pending" });
assert.match(rejectionError(normal, invalidDev), /dev_in_progress requires DEV/);
const review = make("normal", "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" });
accepted(normal, review);
const ordinaryReview = createWorkflowStateMachine();
accepted(ordinaryReview, review);
let ordinaryReviewCalls = 0;
assert.match(ordinaryReview.dispatch(event(dev), () => { ordinaryReviewCalls += 1; return true; }).error, /Only a passed CR-first optimization/);
assert.equal(ordinaryReviewCalls, 0, "ordinary review cannot return directly to DEV or apply side effects");
accepted(ordinaryReview, review);
const qa = make("normal", "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" });
accepted(normal, qa);
const stopped = make("normal", "paused", { dev: "passed", cr: "passed", qa: "pending" });
accepted(normal, stopped);
const resumed = make("normal", "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" });
accepted(normal, resumed);
accepted(normal, stopped);
const wrongResume = make("normal", "dev_in_progress", { dev: "running", cr: "pending", qa: "pending" });
assert.match(rejectionError(normal, wrongResume), /resume its previous phase/);

const optimized = createWorkflowStateMachine();
accepted(optimized, make("optimized", "planned", { cr: "pending", dev: "pending", qa: "pending" }, { work_unit: { roles: ["cr", "dev", "qa"] } }));
accepted(optimized, make("optimized", "ready_for_cr", { cr: "running", dev: "pending", qa: "pending" }, { work_unit: { roles: ["cr", "dev", "qa"] } }));
accepted(optimized, make("optimized", "dev_in_progress", { cr: "passed", dev: "running", qa: "pending" }, { work_unit: { roles: ["cr", "dev", "qa"] } }));
accepted(optimized, make("optimized", "ready_for_cr", { cr: "pending", dev: "passed", qa: "pending" }, { work_unit: { roles: ["cr", "dev", "qa"] } }));
assert.match(rejectionError(optimized, make("optimized", "ready_for_qa", { cr: "passed", dev: "passed", qa: "running" }, { work_unit: { roles: ["dev", "cr", "qa"] } })), /cannot change its selected role order/);

const crRepair = createWorkflowStateMachine();
const crRepairRoles = ["cr", "dev", "qa"];
const crRepairBase = {
  view_id: "cr-repair", work_unit: { work_unit_id: "cr-repair", reference_version: "v1", roles: crRepairRoles },
  handoffs: [{ from: "cr", to: "dev", state: "cr_blocked", handoff_result: "accepted", work_unit_id: "cr-repair", reference_version: "v1", files: ["src/fix.js"], decision: "Fix review finding", next_action: "Return to CR" }],
};
const crRepairSnapshot = (state, statuses) => ({ ...crRepairBase, state, role_details: Object.fromEntries(Object.entries(statuses).map(([role, status]) => [role, { status }])) });
accepted(crRepair, crRepairSnapshot("cr_blocked", { cr: "blocked", dev: "running", qa: "pending" }));
accepted(crRepair, crRepairSnapshot("ready_for_cr", { cr: "pending", dev: "passed", qa: "pending" }));
accepted(crRepair, crRepairSnapshot("ready_for_cr", { cr: "running", dev: "passed", qa: "pending" }));
accepted(crRepair, crRepairSnapshot("ready_for_qa", { cr: "passed", dev: "passed", qa: "running" }));

const assetRepair = createWorkflowStateMachine();
const assetBase = {
  view_id: "asset-repair", state: "cr_blocked",
  work_unit: { work_unit_id: "asset-repair", reference_version: "v1", roles: ["cr", "qa"] },
  role_details: { cr: { status: "blocked", blocker_type: "test_assets" }, qa: { status: "running" } },
  handoffs: [{ from: "cr", to: "qa", state: "cr_blocked", handoff_result: "accepted", work_unit_id: "asset-repair", reference_version: "v1", files: ["test.js"], decision: "Fix the test asset", next_action: "Return to CR" }],
};
accepted(assetRepair, assetBase);
accepted(assetRepair, { ...assetBase, role_details: { cr: assetBase.role_details.cr, qa: { status: "passed" } } });
accepted(assetRepair, { ...assetBase, state: "ready_for_cr", role_details: { cr: { status: "pending" }, qa: { status: "passed" } } });
accepted(assetRepair, { ...assetBase, state: "ready_for_cr", role_details: { cr: { status: "running" }, qa: { status: "passed" } } });
accepted(assetRepair, { ...assetBase, state: "ready_for_qa", role_details: { cr: { status: "passed" }, qa: { status: "pending" } } });
accepted(assetRepair, { ...assetBase, state: "ready_for_qa", role_details: { cr: { status: "passed" }, qa: { status: "running" } } });

const repair = createWorkflowStateMachine();
const originalRoles = ["dev", "cr", "qa"];
const repairView = (state, statuses) => ({
  view_id: "repair", state,
  work_unit: { work_unit_id: "repair", reference_version: "v1", roles: originalRoles },
  role_details: Object.fromEntries(Object.entries(statuses).map(([role, status]) => [role, { status }])),
  handoffs: [{ from: "qa", to: "dev", state: "qa_failed", handoff_result: "accepted", work_unit_id: "repair", reference_version: "v1", files: ["src/fix.js"], decision: "Repair the failed change", next_action: "Return to CR before QA" }],
});
accepted(repair, repairView("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
accepted(repair, repairView("qa_failed", { dev: "passed", cr: "passed", qa: "blocked" }));
accepted(repair, repairView("qa_failed", { dev: "running", cr: "pending", qa: "blocked" }));
accepted(repair, repairView("ready_for_cr", { dev: "passed", cr: "pending", qa: "blocked" }));
accepted(repair, repairView("ready_for_cr", { dev: "passed", cr: "running", qa: "blocked" }));
accepted(repair, repairView("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
accepted(repair, repairView("qa_passed", { dev: "passed", cr: "passed", qa: "passed" }));
accepted(repair, repairView("workflow_ready", { dev: "passed", cr: "passed", qa: "passed" }));

const baseline = createWorkflowStateMachine();
assert.match(rejectionError(baseline, make("bad", "planned", { dev: "running", cr: "running" })), /only one active role/);
assert.match(rejectionError(baseline, make("unknown", "future_state", { dev: "pending" })), /Unknown workflow state/);
assert.equal(rejectionError(baseline, { view_id: "pure", state: "paused" }), null, "pure views do not enter the task state machine");
assert.ok(rejectionError(baseline, make("bad-plan", "planned", { dev: "pending", qa: "passed" })));
assert.ok(rejectionError(baseline, make("bad-pass", "qa_passed", { dev: "passed" }, { work_unit: { roles: ["dev"] } })));
assert.ok(rejectionError(baseline, make("stale-stop", "paused", { dev: "running" }, { resume_state: "dev_in_progress" })));
assert.ok(rejectionError(baseline, make("unbound-stop", "paused", { dev: "pending" })));
assert.ok(rejectionError(baseline, make("bad-held-plan", "paused", { dev: "pending", qa: "passed" }, { resume_state: "planned" })));
const initialHold = make("initial-hold", "paused", { dev: "pending", cr: "pending", qa: "pending" }, { resume_state: "dev_in_progress" });
accepted(baseline, initialHold);
accepted(baseline, make("initial-hold", "dev_in_progress", { dev: "running", cr: "pending", qa: "pending" }));
const noBypass = createWorkflowStateMachine();
accepted(noBypass, crRepairSnapshot("cr_blocked", { cr: "blocked", dev: "pending", qa: "pending" }));
assert.ok(rejectionError(noBypass, crRepairSnapshot("ready_for_cr", { cr: "running", dev: "pending", qa: "pending" })), "CR cannot bypass unperformed repair");
accepted(noBypass, crRepairSnapshot("cr_blocked", { cr: "blocked", dev: "running", qa: "pending" }));
accepted(noBypass, crRepairSnapshot("ready_for_cr", { cr: "running", dev: "passed", qa: "pending" }));
accepted(noBypass, crRepairSnapshot("cr_blocked", { cr: "blocked", dev: "passed", qa: "pending" }));
assert.ok(rejectionError(noBypass, crRepairSnapshot("ready_for_cr", { cr: "running", dev: "passed", qa: "pending" })), "a second CR block cannot reuse the first repair");
accepted(noBypass, crRepairSnapshot("cr_blocked", { cr: "blocked", dev: "running", qa: "pending" }));
accepted(noBypass, crRepairSnapshot("ready_for_cr", { cr: "running", dev: "passed", qa: "pending" }));

const revalidate = createWorkflowStateMachine();
accepted(revalidate, make("revalidate", "workflow_ready", { dev: "passed", cr: "passed", qa: "passed" }, { work_unit: { reference_version: "v1" } }));
assert.ok(rejectionError(revalidate, make("revalidate", "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }, { work_unit: { reference_version: "v2" } })));
const invalidated = make("revalidate", "needs_revalidation", { dev: "running", cr: "pending", qa: "pending" }, { work_unit: { reference_version: "v2" }, resume_state: "dev_in_progress" });
accepted(revalidate, invalidated);
accepted(revalidate, { ...invalidated, state: "paused", role_details: { dev: { status: "pending" }, cr: { status: "pending" }, qa: { status: "pending" } } });
assert.ok(rejectionError(revalidate, { ...invalidated, resume_state: "ready_for_qa", role_details: { dev: { status: "passed" }, cr: { status: "passed" }, qa: { status: "running" } } }), "hold must preserve the earliest invalidated phase");
accepted(revalidate, invalidated);
accepted(revalidate, make("revalidate", "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" }, { work_unit: { reference_version: "v2" } }));
accepted(revalidate, make("revalidate", "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }, { work_unit: { reference_version: "v2" } }));
accepted(revalidate, make("revalidate", "qa_passed", { dev: "passed", cr: "passed", qa: "passed" }, { work_unit: { reference_version: "v2" } }));
accepted(revalidate, make("revalidate", "workflow_ready", { dev: "passed", cr: "passed", qa: "passed" }, { work_unit: { reference_version: "v2" } }));

function freeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
const pureEvent = freeze(event(make("pure-transition", "planned", { dev: "pending", cr: "pending", qa: "pending" })));
const firstTransition = freeze(transition(null, pureEvent));
const pureUpdate = freeze(event(make("pure-transition", "dev_in_progress", { dev: "running", cr: "pending", qa: "pending" })));
const unchanged = structuredClone([firstTransition, pureUpdate]);
assert.deepEqual(transition(firstTransition.next, pureUpdate), transition(firstTransition.next, pureUpdate), "transition is deterministic");
assert.deepEqual([firstTransition, pureUpdate], unchanged, "transition does not change its inputs");

const guarded = createWorkflowStateMachine();
assert.deepEqual(Object.keys(guarded), ["dispatch"], "dispatch is the only state update entry");
let applyCalls = 0;
const apply = () => { applyCalls += 1; return true; };
assert.match(guarded.dispatch({ type: "UNKNOWN", snapshot: planned }, apply).error, /Unknown workflow event/);
assert.match(guarded.dispatch(event(null), apply).error, /snapshot must be an object/);
assert.match(guarded.dispatch(event({ view_id: " " }), apply).error, /non-empty string/);
assert.match(guarded.dispatch(event(invalid), apply).error, /CR.*passed/);
assert.equal(applyCalls, 0, "rejected events and snapshots must not apply side effects");

for (const callback of [() => false, () => null, () => undefined, () => { throw new Error("apply failed"); }, () => Promise.resolve(true)]) {
  const machine = createWorkflowStateMachine();
  accepted(machine, dev);
  try {
    const result = machine.dispatch(event(review), callback);
    assert.ok(result.value === false || result.value == null);
  } catch (error) {
    assert.match(error.message, /apply failed|return synchronously/);
  }
  assert.match(rejectionError(machine, qa), /Illegal workflow transition/, "failed application cannot advance the workflow");
  accepted(machine, review);
  accepted(machine, qa);
}
const reentrant = createWorkflowStateMachine();
accepted(reentrant, dev);
assert.throws(() => reentrant.dispatch(event(review), () => reentrant.dispatch(event(qa), apply)), /cannot reenter/);
assert.match(rejectionError(reentrant, qa), /Illegal workflow transition/, "reentrant failure cannot commit the outer candidate");
accepted(reentrant, review);

const isolated = createWorkflowStateMachine();
const mutable = structuredClone(planned);
assert.equal(isolated.dispatch(event(mutable), () => {
  mutable.view_id = "changed";
  mutable.work_unit.roles.splice(0, 3, "qa");
  mutable.role_details.dev.status = "passed";
  return true;
}).error, null);
accepted(isolated, dev);
const bounded = createWorkflowStateMachine({ maxViews: 1 });
accepted(bounded, planned);
assert.throws(() => bounded.dispatch(event(make("second", "planned", { dev: "pending" })), apply), /workflow state capacity reached/);
assert.equal(applyCalls, 0, "capacity rejection must occur before applying side effects");
accepted(bounded, dev);
accepted(bounded, { view_id: "untracked-pure" });
accepted(bounded, review);

for (const from of roleStatuses) {
  const machine = createWorkflowStateMachine();
  const snapshot = (state, status) => make("req-running-" + from, state, { req: status }, { work_unit: { roles: ["req"] }, resume_state: "planned" });
  accepted(machine, snapshot(["blocked", "needs_user_confirm"].includes(from) ? "paused" : "planned", from));
  assert.equal(rejectionError(machine, snapshot("planned", "running")) === null, from !== "passed", from + " -> running on resume");
}

const completeStates = ["workflow_ready", "passed", "qa_success", "completed", "complete", "done", "success", "successful", "succeeded"];
for (const state of [...completeStates, "failed", "cancelled", "canceled", "skipped"]) {
  const machine = createWorkflowStateMachine(), id = "terminal-" + state;
  const snapshot = (next, statuses, extra) => make(id, next, statuses, extra);
  const final = snapshot(state, { dev: "passed", cr: "passed", qa: "passed" });
  accepted(machine, final);
  accepted(machine, final);
  assert.match(rejectionError(machine, snapshot("dev_in_progress", { dev: "running", cr: "pending", qa: "pending" })), /cannot restart|must revalidate/);
  const restart = snapshot("needs_revalidation", { dev: "running", cr: "pending", qa: "pending" }, { resume_state: "dev_in_progress" });
  if (["cancelled", "canceled", "skipped"].includes(state)) assert.match(rejectionError(machine, restart), /cannot restart/);
  else {
    accepted(machine, restart);
    accepted(machine, snapshot("dev_in_progress", { dev: "running", cr: "pending", qa: "pending" }));
  }
}

for (const [phase, statuses, target] of [
  ["dev_in_progress", { dev: "running", cr: "pending", qa: "pending" }, "dev"],
  ["ready_for_cr", { dev: "passed", cr: "running", qa: "pending" }, "cr"],
  ["ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }, "qa"],
]) {
  for (const hold of ["paused", "waiting", "blocked", "needs_user_confirm", "needs_revision"]) {
    const machine = createWorkflowStateMachine(), id = phase + "-" + hold;
    const stoppedStatuses = { ...statuses, [target]: "needs_user_confirm" };
    accepted(machine, make(id, phase, statuses));
    accepted(machine, make(id, hold, stoppedStatuses));
    accepted(machine, { view_id: id, state: "paused" });
    const wrongPhase = phase === "dev_in_progress" ? "ready_for_cr" : "dev_in_progress";
    const wrongStatuses = wrongPhase === "ready_for_cr" ? { dev: "passed", cr: "running", qa: "pending" } : { dev: "running", cr: "pending", qa: "pending" };
    assert.match(rejectionError(machine, make(id, wrongPhase, wrongStatuses)), /resume its previous phase/);
    accepted(machine, make(id, phase, statuses));
  }
  const machine = createWorkflowStateMachine(), id = "resume-" + phase;
  const pendingTarget = { ...statuses, [target]: "pending" };
  accepted(machine, make(id, "needs_revalidation", pendingTarget, { resume_state: phase }));
  assert.match(rejectionError(machine, make(id, "needs_revalidation", pendingTarget, { resume_state: "planned" })), /requires resume_state/);
  const wrongTarget = target === "dev" ? "cr" : "dev";
  assert.ok(rejectionError(machine, make(id, "needs_revalidation", { ...pendingTarget, [wrongTarget]: "running" }, { resume_state: phase })));
  accepted(machine, make(id, phase, statuses));
}
const earliest = createWorkflowStateMachine();
accepted(earliest, dev);
assert.match(rejectionError(earliest, make("normal", "needs_revalidation", { dev: "passed", cr: "running", qa: "pending" }, { resume_state: "ready_for_cr" })), /cannot skip an earlier invalidated phase/);
accepted(earliest, dev);
accepted(earliest, make("normal", "needs_revalidation", { dev: "pending", cr: "pending", qa: "pending" }, { resume_state: "dev_in_progress" }));
accepted(earliest, dev);

for (const [resume, next, statuses, expected] of [
  ["dev_in_progress", "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" }, null],
  ["ready_for_cr", "cr_blocked", { dev: "passed", cr: "blocked", qa: "pending" }, null],
  ["ready_for_qa", "qa_failed", { dev: "passed", cr: "passed", qa: "blocked" }, null],
  ["ready_for_qa", "qa_conditional", { dev: "passed", cr: "passed", qa: "blocked" }, null],
  ["ready_for_qa", "qa_passed", { dev: "passed", cr: "passed", qa: "passed" }, null],
  ["dev_in_progress", "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }, /resume at its declared phase/],
  ["ready_for_cr", "ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }, /resume at its declared phase/],
]) {
  const machine = createWorkflowStateMachine(), id = resume + "-exit-" + next;
  const initial = { dev: "passed", cr: "passed", qa: "pending", [{ dev_in_progress: "dev", ready_for_cr: "cr", ready_for_qa: "qa" }[resume]]: "running" };
  if (resume === "dev_in_progress") initial.cr = "pending";
  accepted(machine, make(id, "needs_revalidation", initial, { resume_state: resume }));
  const error = rejectionError(machine, make(id, next, statuses));
  if (expected) assert.match(error, expected);
  else assert.equal(error, null, resume + " -> " + next);
}

for (const state of ["qa_failed", "qa_conditional"]) {
  const environmentRetry = createWorkflowStateMachine();
  accepted(environmentRetry, repairView("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
  accepted(environmentRetry, repairView(state, { dev: "passed", cr: "passed", qa: "blocked" }));
  const changed = repairView("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" });
  changed.work_unit = { ...changed.work_unit, reference_version: "v2" };
  assert.match(rejectionError(environmentRetry, changed), /changed reference_version requires/);
  accepted(environmentRetry, repairView("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
  const codeRepair = createWorkflowStateMachine();
  const snapshot = (phase, statuses) => {
    const value = repairView(phase, statuses);
    value.handoffs = value.handoffs.map(handoff => ({ ...handoff, state }));
    return value;
  };
  accepted(codeRepair, snapshot("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
  accepted(codeRepair, snapshot(state, { dev: "passed", cr: "passed", qa: "blocked" }));
  accepted(codeRepair, snapshot(state, { dev: "running", cr: "pending", qa: "blocked" }));
  assert.match(rejectionError(codeRepair, snapshot("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" })), /requires CR review before retesting/);
  accepted(codeRepair, snapshot("ready_for_cr", { dev: "passed", cr: "running", qa: "blocked" }));
  accepted(codeRepair, snapshot("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
}
const qaRevalidation = createWorkflowStateMachine();
accepted(qaRevalidation, repairView("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
accepted(qaRevalidation, repairView("qa_failed", { dev: "passed", cr: "passed", qa: "blocked" }));
accepted(qaRevalidation, { ...repairView("needs_revalidation", { dev: "running", cr: "pending", qa: "blocked" }), resume_state: "dev_in_progress" });
accepted(qaRevalidation, repairView("ready_for_cr", { dev: "passed", cr: "running", qa: "blocked" }));
accepted(qaRevalidation, repairView("ready_for_qa", { dev: "passed", cr: "passed", qa: "running" }));
for (const cr of ["pending", "blocked"]) {
  const snapshot = repairView("needs_revalidation", { cr, dev: "pending", qa: "blocked" });
  accepted(createWorkflowStateMachine(), { ...snapshot, resume_state: "dev_in_progress", work_unit: { ...snapshot.work_unit, roles: ["cr", "dev", "qa"] } });
}

for (const [label, patch, expected] of [
  ["work-unit", { work_unit: { work_unit_id: "other" } }, /cannot change work_unit_id/],
  ["role-order", { work_unit: { roles: ["cr", "dev", "qa"] } }, /cannot change its selected role order/],
  ["baseline", { work_unit: { reference_version: "v2" } }, /changed reference_version requires/],
  ["removed-status", { role_details: { dev: { status: "pending" }, cr: { status: "pending" } } }, /QA status cannot be removed/],
]) {
  const machine = createWorkflowStateMachine(), id = "immutable-" + label;
  const base = make(id, "planned", { dev: "pending", cr: "pending", qa: "pending" }, { work_unit: { reference_version: "v1" } });
  accepted(machine, base);
  assert.match(rejectionError(machine, { ...base, ...patch, state: "paused", work_unit: { ...base.work_unit, ...patch.work_unit } }), expected);
  accepted(machine, make(id, "dev_in_progress", { dev: "running", cr: "pending", qa: "pending" }, { work_unit: { reference_version: "v1" } }));
}
for (const selected of [["req"], ["dev"], ["cr"], ["req", "dev", "cr"]]) {
  const machine = createWorkflowStateMachine(), id = "without-qa-" + selected.join("-");
  const target = selected.at(-1), phase = { req: "planned", dev: "dev_in_progress", cr: "ready_for_cr" }[target];
  accepted(machine, make(id, phase, Object.fromEntries(selected.map(role => [role, role === target ? "running" : "passed"])), { work_unit: { roles: selected } }));
  accepted(machine, make(id, "complete", Object.fromEntries(selected.map(role => [role, "passed"])), { work_unit: { roles: selected } }));
}
for (const [snapshot, expected] of [
  [make("missing-state", undefined, {}), /Unknown workflow state: <missing>/],
  [make("missing-target", "dev_in_progress", { cr: "pending" }, { work_unit: { roles: ["cr"] } }), /requires selected DEV/],
  [make("early-later-pass", "dev_in_progress", { dev: "running", cr: "passed", qa: "pending" }), /cannot contain a completed or active later role cr/],
  [make("qa-pending-before-cr", "ready_for_qa", { dev: "passed", cr: "pending", qa: "pending" }), /ready_for_qa requires selected CR passed/],
  [make("cr-pending-before-dev", "ready_for_cr", { dev: "pending", cr: "pending", qa: "pending" }), /CR requires preceding role dev passed/],
  [make("paused-multiple-active", "paused", { dev: "running", cr: "running", qa: "pending" }, { resume_state: "dev_in_progress" }), /Serial workflow permits only one active role/],
  [make("cr-not-blocked", "cr_blocked", { dev: "passed", cr: "running", qa: "pending" }), /requires selected CR blocked/],
  [make("cr-prior-unfinished", "cr_blocked", { dev: "pending", cr: "blocked", qa: "pending" }), /predecessors passed or repairing/],
  [make("cr-unobserved-pass", "cr_blocked", { dev: "passed", cr: "blocked", qa: "passed" }), /unobserved QA pass/],
  [make("qa-not-blocked", "qa_failed", { dev: "passed", cr: "passed", qa: "running" }), /requires selected QA blocked/],
  ...["qa_failed", "qa_conditional"].map(state => [make("qa-cr-active-" + state, state, { dev: "passed", cr: "running", qa: "blocked" }), /permits only a scoped DEV repair/]),
  [make("qa-before-dev", "qa_conditional", { dev: "pending", cr: "passed", qa: "blocked" }), /DEV passed before QA can fail/],
  [make("qa-cr-unfinished", "qa_failed", { dev: "passed", cr: "needs_user_confirm", qa: "blocked" }), /CR passed or invalidated/],
  [make("qa-no-repair", "qa_failed", { dev: "passed", cr: "pending", qa: "blocked" }), /cannot invalidate CR without an observed repair/],
  [make("empty-complete", "complete", {}, { work_unit: { roles: [] } }), /requires selected roles/],
  [make("unfinished-complete", "complete", { dev: "passed", cr: "passed", qa: "pending" }), /requires all selected roles passed/],
  [make("qa-without-cr", "qa_passed", { qa: "passed" }, { work_unit: { roles: ["qa"] } }), /requires CR selected before QA completion/],
  [{ view_id: "missing-roles", state: "planned", work_unit: {} }, /work_unit.roles is required/],
]) {
  let calls = 0;
  const result = createWorkflowStateMachine().dispatch(event(snapshot), () => { calls += 1; return true; });
  assert.match(result.error, expected);
  assert.equal(calls, 0, snapshot.view_id + " rejection must not apply side effects");
}
const legacyHold = createWorkflowStateMachine();
accepted(legacyHold, dev);
accepted(legacyHold, { view_id: dev.view_id, state: "needs_revision" });
assert.match(rejectionError(legacyHold, { view_id: dev.view_id, state: "planned" }), /requires a full work_unit snapshot/);
accepted(legacyHold, dev);
accepted(createWorkflowStateMachine(), make("string-role", "planned", { req: "running" }, { work_unit: { roles: " req " } }));
const changedReview = createWorkflowStateMachine();
accepted(changedReview, make("changed-review", "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" }, { work_unit: { reference_version: "v1" } }));
accepted(changedReview, make("changed-review", "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" }, { work_unit: { reference_version: "v2" } }));

for (const maxViews of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => createWorkflowStateMachine({ maxViews }), /positive safe integer/);
const invalidCallback = createWorkflowStateMachine();
for (const callback of [undefined, null, false, {}]) assert.throws(() => invalidCallback.dispatch(event(dev), callback), /synchronous function/);
accepted(invalidCallback, dev);
for (const throws of [false, true]) {
  const machine = createWorkflowStateMachine();
  let reads = 0, thenCalls = 0;
  const value = { get then() { reads += 1; if (throws) throw new Error("then getter failed"); return () => { thenCalls += 1; }; } };
  accepted(machine, dev);
  assert.throws(() => machine.dispatch(event(review), () => value), throws ? /then getter failed/ : /return synchronously/);
  assert.equal(reads, 1);
  assert.equal(thenCalls, 0);
  assert.match(rejectionError(machine, qa), /Illegal workflow transition/);
  accepted(machine, review);
  accepted(machine, qa);
}

async function serverIntegration() {
  let nextId = 0;
  const pending = new Map();
  const session = startServer({ onReply: reply => pending.get(reply.id)?.resolve(reply) });
  const request = args => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: value => { pending.delete(id); resolve(value); }, reject });
    session.server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "show_sc_task_view", arguments: args } }) + "\n");
  });
  const show = async snapshot => {
    const reply = await request(snapshot ? { snapshot } : {});
    return reply.error ? reply : reply.result.structuredContent.snapshot;
  };
  try {
    const base = make("server", "planned", { dev: "pending", cr: "pending", qa: "pending" });
    assert.equal((await show(base)).state, "planned");
    const running = make("server", "dev_in_progress", { dev: "running", cr: "pending", qa: "pending" });
    await show(running);
    const missingState = await request({ snapshot: { view_id: "server", work_unit: { roles } } });
    assert.match(missingState.error.message, /state must be a string/);
    const mismatch = make("server", "ready_for_qa", { dev: "passed", cr: "pending", qa: "running" });
    assert.equal((await show(mismatch)).error.code, -32602);
    await delay(30);
    const restored = await show();
    assert.equal(restored.state, "dev_in_progress");
    assert.equal(restored.role_details.qa.status, "pending");
    assert.equal(restored.role_details.qa.metrics.elapsed_ms, 0, "rejected QA activity must not start its timer");
    assert.ok(restored.role_details.dev.metrics.elapsed_ms > 0, "the prior valid DEV activity must continue");

    const review = make("server", "ready_for_cr", { dev: "passed", cr: "running", qa: "pending" });
    await show(review);
    const skipped = make("server", "workflow_ready", { dev: "passed", cr: "passed", qa: "passed" });
    assert.equal((await show(skipped)).error.code, -32602);
    const afterSkip = await show();
    assert.equal(afterSkip.state, "ready_for_cr", "an illegal phase jump must retain the last accepted snapshot");
    assert.equal(afterSkip.role_details.cr.status, "running");
    assert.equal(afterSkip.role_details.qa.status, "pending");
  } finally {
    session.complete();
  }
}

serverIntegration().then(() => console.log("SC workflow state machine consistency, legal transitions, holds, optimization, repair and server rollback passed."))
  .catch(error => { console.error(error); process.exitCode = 1; });
