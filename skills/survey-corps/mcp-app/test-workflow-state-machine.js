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
