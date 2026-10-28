"use strict";

const { workflowError } = require("./elapsed-tracker");
const ROLES = ["req", "dev", "cr", "qa"];
const PHASES = new Map([
  ["confirmed", "confirmed"], ["planned", "planned"], ["dev_in_progress", "dev"],
  ["ready_for_cr", "review"], ["cr_blocked", "cr_blocked"], ["ready_for_qa", "qa"],
  ["qa_failed", "qa_failed"], ["qa_conditional", "qa_conditional"], ["qa_passed", "qa_passed"],
  ...["workflow_ready", "passed", "qa_success", "completed", "complete", "done", "success", "successful", "succeeded"].map(state => [state, "complete"]),
  ...["needs_user_confirm", "paused", "waiting", "blocked"].map(state => [state, "hold"]),
  ["needs_revision", "revision"], ["needs_revalidation", "revalidation"],
  ["failed", "failed"], ["cancelled", "cancelled"], ["canceled", "cancelled"], ["skipped", "skipped"],
]);
const NEXT = {
  confirmed: ["planned"], planned: ["dev", "review"], dev: ["review"],
  review: ["cr_blocked", "qa", "dev"], cr_blocked: ["review"],
  qa: ["qa_failed", "qa_conditional", "qa_passed"], qa_failed: ["review", "qa"],
  qa_conditional: ["review", "qa"], qa_passed: ["complete"],
};
const TERMINAL = new Set(["complete", "failed", "cancelled", "skipped"]);
const OVERLAY = new Set(["hold", "revision"]);
const RESUME = new Map([["dev_in_progress", "dev"], ["ready_for_cr", "review"], ["ready_for_qa", "qa"]]);
const RANK = { confirmed: 0, planned: 0, dev: 0, review: 1, cr_blocked: 1, qa: 2, qa_failed: 2, qa_conditional: 2, qa_passed: 2, complete: 3, failed: 3 };
const STATUS_NEXT = {
  pending: ["running", "blocked", "needs_user_confirm"],
  running: ["passed", "blocked", "needs_user_confirm"],
  blocked: ["pending", "running", "needs_user_confirm"],
  needs_user_confirm: ["pending", "running", "blocked"], passed: [],
};
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const record = value => object(value) ? value : {};
const phaseOf = state => PHASES.get(state);
const selectedRoles = value => [...new Set((Array.isArray(value) ? value : [value]).filter(role => typeof role === "string").map(role => role.trim().toLowerCase()).filter(role => ROLES.includes(role)))];
const statusOf = (snapshot, role) => record(record(snapshot.role_details)[role]).status;
const isRepairPhase = phase => ["cr_blocked", "qa_failed", "qa_conditional"].includes(phase);

function stateOf(snapshot, previous) {
  const work = record(snapshot.work_unit), roles = selectedRoles(work.roles), phase = phaseOf(snapshot.state);
  const statuses = Object.fromEntries(roles.map(role => [role, statusOf(snapshot, role)]));
  const active = roles.find(role => statuses[role] === "running");
  const source = previous && OVERLAY.has(previous.phase) ? previous.source : previous && {
    phase: previous.phase, resume: previous.resume,
  };
  const previousPhase = previous && OVERLAY.has(previous.phase) ? previous.source.phase : previous?.phase;
  const repairRole = isRepairPhase(phase) ? active || (previousPhase === phase ? previous?.repairRole : null) : previous?.repairRole;
  return { state: snapshot.state, phase, roles, statuses, active, workUnitId: work.work_unit_id,
    referenceVersion: work.reference_version, resume: RESUME.get(snapshot.resume_state),
    source: OVERLAY.has(phase) ? source || { phase: phaseOf(snapshot.resume_state), resume: null } : null,
    repairRole: phase === "qa" || phase === "complete" ? null : repairRole };
}

function phaseRoleError(snapshot, state, phase) {
  const { roles, statuses, active } = state;
  const target = { dev: "dev", review: "cr", qa: "qa" }[phase];
  if (!roles.includes(target)) return snapshot.state + " requires selected " + target.toUpperCase();
  if (active && active !== target) return snapshot.state + " permits only " + target.toUpperCase() + " to run";
  const valid = phase === "dev" ? ["running", "passed"] : ["pending", "running", "passed"];
  if (!valid.includes(statuses[target])) return snapshot.state + " requires " + target.toUpperCase() + " " + valid.join("/");
  if (phase === "qa" && (!roles.includes("cr") || statuses.cr !== "passed")) return "ready_for_qa requires selected CR passed";
  for (const role of roles) {
    if (role === target || statuses[role] == null) continue;
    const qaRework = snapshot.state === "needs_revalidation" && state.resume === "dev" && statuses.qa === "blocked";
    if (roles.indexOf(role) < roles.indexOf(target)) {
      if (statuses[role] !== "passed" && !(qaRework && role === "cr" && ["pending", "blocked"].includes(statuses.cr))) return target.toUpperCase() + " requires preceding role " + role + " passed";
    } else {
      const implementation = phase === "review" && role === "dev" && statuses.dev === "passed";
      const blockedQa = phase === "review" && role === "qa" && statuses.qa === "blocked" && statuses.dev === "passed";
      const testAsset = phase === "review" && role === "qa" && statuses.qa === "passed" && state.repairRole === "qa";
      if (statuses[role] !== "pending" && !implementation && !blockedQa && !testAsset && !(qaRework && ["cr", "qa"].includes(role))) return snapshot.state + " cannot contain a completed or active later role " + role;
    }
  }
  return null;
}

function consistencyError(snapshot, state, previous) {
  const { phase, roles, statuses, active } = state;
  if (!phase) return "Unknown workflow state: " + (typeof snapshot.state === "string" ? snapshot.state : "<missing>");
  if (roles.filter(role => statuses[role] === "running").length > 1) return "Serial workflow permits only one active role";
  if (phase === "hold" || phase === "revision" || TERMINAL.has(phase) && phase !== "complete") {
    if (active) return snapshot.state + " cannot retain a running role";
    if (OVERLAY.has(phase) && !previous && (!state.source.phase || OVERLAY.has(state.source.phase) || TERMINAL.has(state.source.phase) || state.source.phase === "revalidation")) return "An initial hold/revision snapshot requires a valid resume_state";
    if (OVERLAY.has(phase) && !previous) {
      const target = { dev: "dev", review: "cr", qa: "qa" }[state.source.phase] || (state.source.phase === "planned" && roles[0] === "req" ? "req" : null);
      const projected = { ...snapshot, state: snapshot.resume_state };
      if (target && ["pending", "blocked", "needs_user_confirm"].includes(statuses[target])) projected.role_details = { ...snapshot.role_details, [target]: { ...snapshot.role_details[target], status: "running" } };
      return consistencyError(projected, stateOf(projected));
    }
    return null;
  }
  if (phase === "confirmed" || phase === "planned") {
    return roles.some(role => statuses[role] != null && statuses[role] !== "pending" && !(phase === "planned" && role === "req" && ["running", "passed"].includes(statuses.req))) ? snapshot.state + " requires unstarted roles pending" : null;
  }
  if (["dev", "review", "qa"].includes(phase)) return phaseRoleError(snapshot, state, phase);
  if (phase === "cr_blocked") {
    if (!roles.includes("cr") || statuses.cr !== "blocked") return "cr_blocked requires selected CR blocked";
    const unfinished = roles.slice(0, roles.indexOf("cr")).some(role => statuses[role] != null && statuses[role] !== "passed" && !(role === "dev" && state.repairRole === "dev"));
    if (unfinished) return "cr_blocked requires its selected predecessors passed or repairing";
    if (statuses.qa === "passed" && state.repairRole !== "qa") return "cr_blocked cannot contain an unobserved QA pass";
    return active && !["dev", "qa"].includes(active) ? "cr_blocked permits only a scoped DEV or QA repair" : null;
  }
  if (phase === "qa_failed" || phase === "qa_conditional") {
    if (!roles.includes("qa") || !roles.includes("cr") || statuses.qa !== "blocked") return snapshot.state + " requires selected QA blocked and selected CR";
    if (active && active !== "dev") return snapshot.state + " permits only a scoped DEV repair";
    if (!state.repairRole && roles.includes("dev") && statuses.dev != null && statuses.dev !== "passed") return snapshot.state + " requires DEV passed before QA can fail";
    if (statuses.cr !== "passed" && !["pending", "blocked"].includes(statuses.cr)) return snapshot.state + " requires CR passed or invalidated for repair";
    return statuses.cr !== "passed" && !active && !state.repairRole ? snapshot.state + " cannot invalidate CR without an observed repair" : null;
  }
  if (phase === "revalidation") {
    if (!state.resume) return "needs_revalidation requires resume_state dev_in_progress, ready_for_cr or ready_for_qa";
    const target = { dev: "dev", review: "cr", qa: "qa" }[state.resume];
    const candidate = active || statuses[target] !== "pending" ? state : { ...state, statuses: { ...statuses, [target]: "running" } };
    return phaseRoleError(snapshot, candidate, state.resume);
  }
  if (phase === "qa_passed" && !roles.includes("qa")) return "qa_passed requires QA selected";
  if (phase === "qa_passed" || phase === "complete") {
    if (!roles.length) return snapshot.state + " requires selected roles";
    if (roles.some(role => statuses[role] !== "passed")) return snapshot.state + " requires all selected roles passed";
    if (roles.includes("qa") && !roles.includes("cr")) return snapshot.state + " requires CR selected before QA completion";
  }
  return null;
}

function effectivePrevious(previous) {
  return OVERLAY.has(previous.phase) ? { ...previous, ...previous.source } : previous;
}

function phaseTransitionError(previous, next) {
  if (previous.phase === "cancelled" || previous.phase === "skipped") return previous.phase === next.phase ? null : "A cancelled or skipped workflow cannot restart";
  if (TERMINAL.has(previous.phase) && next.phase !== previous.phase && next.phase !== "revalidation") return "A terminal workflow must revalidate before restarting";
  if (OVERLAY.has(next.phase) || ["failed", "cancelled", "skipped"].includes(next.phase)) return null;
  const source = effectivePrevious(previous);
  if (next.phase === "revalidation") {
    const rank = source.phase === "revalidation" ? RANK[source.resume] : RANK[source.phase];
    return rank !== undefined && RANK[next.resume] > rank ? "Revalidation cannot skip an earlier invalidated phase" : null;
  }
  if (OVERLAY.has(previous.phase) && next.phase !== source.phase) return "A held workflow must resume its previous phase or revalidate";
  if (source.phase === next.phase) return null;
  if (source.phase === "revalidation") {
    const allowed = { dev: ["dev", "review"], review: ["review", "cr_blocked"], qa: ["qa", "qa_failed", "qa_conditional", "qa_passed"] }[source.resume];
    return allowed?.includes(next.phase) ? null : "Revalidation must resume at its declared phase";
  }
  if (next.phase === "complete" && !next.roles.includes("qa") && next.roles.every(role => next.statuses[role] === "passed")) return null;
  if (!NEXT[source.phase]?.includes(next.phase)) return "Illegal workflow transition: " + previous.state + " -> " + next.state;
  if (source.phase === "review" && next.phase === "dev" && !(next.roles.indexOf("cr") < next.roles.indexOf("dev") && next.statuses.cr === "passed")) return "Only a passed CR-first optimization can proceed from review to DEV";
  if (isRepairPhase(source.phase) && next.phase === "review" && (!previous.repairRole || !["passed", "pending"].includes(next.statuses[previous.repairRole]))) return "A blocked review requires an observed scoped repair before CR resumes";
  if (["qa_failed", "qa_conditional"].includes(source.phase) && next.phase === "qa" && (previous.repairRole || next.referenceVersion !== previous.referenceVersion)) return "Changed QA repair requires CR review before retesting";
  return null;
}

function roleTransitionError(previous, next) {
  const source = effectivePrevious(previous);
  for (const role of next.roles) {
    const before = previous.statuses[role], after = next.statuses[role];
    if (before === after || before == null) continue;
    if (after == null) return role.toUpperCase() + " status cannot be removed from a view";
    const invalidation = next.phase === "revalidation" || role === "cr" && (isRepairPhase(next.phase) || source.phase === "dev" && next.phase === "review");
    const repairRestart = isRepairPhase(next.phase) && role === next.active || previous.repairRole === "qa" && next.phase === "qa" && role === "qa";
    const explicitStop = OVERLAY.has(next.phase) || TERMINAL.has(next.phase) || isRepairPhase(next.phase);
    if (before === "passed" && (invalidation || repairRestart) && ["pending", "running", "blocked"].includes(after)) continue;
    if (before === "running" && after === "pending" && (explicitStop || invalidation)) continue;
    if (!STATUS_NEXT[before]?.includes(after)) return "Illegal " + role.toUpperCase() + " status transition: " + before + " -> " + after;
  }
  return null;
}

function candidate(snapshot, previous) {
  if (object(snapshot.work_unit)) return stateOf(snapshot, previous);
  // Legacy pure controls stop a task without changing its authoritative role history.
  const phase = phaseOf(snapshot.state);
  if (previous && OVERLAY.has(phase)) return { ...previous, phase, state: snapshot.state,
    active: undefined, source: OVERLAY.has(previous.phase) ? previous.source : { phase: previous.phase, resume: previous.resume } };
  return null;
}

function transition(previous, event) {
  if (!object(event) || event.type !== "SNAPSHOT_RECEIVED") return { error: "Unknown workflow event" };
  const snapshot = event.snapshot;
  if (!object(snapshot)) return { error: "snapshot must be an object" };
  if (typeof snapshot.view_id !== "string" || !snapshot.view_id.trim()) return { error: "snapshot.view_id must be a non-empty string" };
  const next = candidate(snapshot, previous);
  if (!object(snapshot.work_unit)) {
    const error = previous && !next ? "An observed task requires a full work_unit snapshot, except for a pure hold" : next ? phaseTransitionError(previous, next) : null;
    return { error, next: error ? null : next };
  }
  if (!Object.hasOwn(snapshot.work_unit, "roles")) return { error: "snapshot.work_unit.roles is required" };
  if (previous && previous.workUnitId !== next.workUnitId) return { error: "A view_id cannot change work_unit_id" };
  if (previous && JSON.stringify(previous.roles) !== JSON.stringify(next.roles)) return { error: "A view_id cannot change its selected role order" };
  if (previous?.referenceVersion && previous.referenceVersion !== next.referenceVersion && !(next.phase === "revalidation" || next.phase === "review" && next.statuses.cr !== "passed")) return { error: "A changed reference_version requires revalidation or a new CR review" };
  const error = workflowError(snapshot) || consistencyError(snapshot, next, previous) ||
    (previous ? phaseTransitionError(previous, next) || roleTransitionError(previous, next) : null);
  return { error, next: error ? null : next };
}

function createWorkflowStateMachine({ maxViews = 128 } = {}) {
  if (!Number.isSafeInteger(maxViews) || maxViews < 1) throw new TypeError("maxViews must be a positive safe integer");
  const views = new Map();
  let dispatching = false;
  function dispatch(event, applySnapshot) {
    if (dispatching) throw new Error("Workflow dispatch cannot reenter");
    if (typeof applySnapshot !== "function") throw new TypeError("applySnapshot must be a synchronous function");
    dispatching = true;
    try {
      const viewId = record(record(event).snapshot).view_id;
      const result = transition(views.get(viewId), event);
      if (result.error) return { error: result.error };
      if (result.next && !views.has(viewId) && views.size >= maxViews) throw new RangeError(`SC workflow state capacity reached (${maxViews} views); restart the server or reuse an existing view_id`);
      // Keep the validated candidate private even if the callback mutates its input snapshot.
      const next = result.next && structuredClone(result.next);
      const value = applySnapshot();
      if (typeof value?.then === "function") throw new TypeError("applySnapshot must return synchronously");
      if (value !== false && value != null && next) views.set(viewId, next);
      return { error: null, value };
    } finally {
      dispatching = false;
    }
  }
  return { dispatch };
}

module.exports = { createWorkflowStateMachine, transition };
