"use strict";
const { performance } = require("node:perf_hooks");

const ROLES = new Set(["req", "dev", "cr", "qa"]);
const STOPPED = new Set(["needs_user_confirm", "paused", "waiting", "blocked", "passed", "qa_success", "skipped", "qa_passed", "workflow_ready", "completed", "complete", "done", "success", "successful", "succeeded", "failed", "cancelled", "canceled"]);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const record = value => object(value) ? value : {};
const status = value => typeof value === "string" ? value.trim().toLowerCase().replace(/[ -]+/g, "_") : "";
const initialElapsed = metrics => Number.isSafeInteger(record(metrics).elapsed_ms) && metrics.elapsed_ms >= 0 ? metrics.elapsed_ms : 0;
const stopwatch = metrics => ({ elapsed: initialElapsed(metrics), active: false });
const selectedRoles = value => [...new Set((Array.isArray(value) ? value : [value]).filter(value => typeof value === "string").map(value => value.trim().toLowerCase()).filter(value => ROLES.has(value)))];

function filePath(value) {
  const path=(typeof value === "string" ? value.trim() : ""),local=path.replaceAll(String.fromCharCode(92),"/");
  const relative=/^[a-z]:[/]$/i.test(local.slice(0,3))?local.slice(3):local;
  const invalid=relative.includes(":")||typeof value==="string"&&/\p{Cc}/u.test(value);
  return path&&!path.startsWith(String.fromCharCode(92))&&!local.startsWith("//")&&!local.endsWith("/")&&!invalid&&!relative.split("/").includes("..")?path:"";
}
function acceptedRepair(snapshot, from, to) {
  const work = record(snapshot.work_unit), handoff = Array.isArray(snapshot.handoffs) ? record(snapshot.handoffs.at(-1)) : {};
  const state = status(snapshot.state), repairState = from === "qa" ? ["qa_failed", "qa_conditional"].includes(handoff.state) && (state === handoff.state || (state === "needs_revalidation" && snapshot.resume_state === "dev_in_progress")) : state === "cr_blocked" && handoff.state === "cr_blocked";
  return repairState &&
    typeof work.work_unit_id === "string" && work.work_unit_id.trim() !== "" && handoff.work_unit_id === work.work_unit_id &&
    typeof work.reference_version === "string" && work.reference_version.trim() !== "" && handoff.reference_version === work.reference_version &&
    handoff.from === from && handoff.to === to && handoff.handoff_result === "accepted" &&
    Array.isArray(handoff.files) && handoff.files.length > 0 && handoff.files.every(file => filePath(file)) &&
    typeof handoff.decision === "string" && handoff.decision.trim() !== "" && typeof handoff.next_action === "string" && handoff.next_action.trim() !== "";
}
function workflowError(snapshot, selected = selectedRoles(record(snapshot.work_unit).roles)) {
  if (STOPPED.has(status(snapshot.state))) return null;
  const details = record(snapshot.role_details), active = selected.filter(role => record(details[role]).status === "running");
  if (active.length > 1) return "Serial workflow permits only one active role: " + active.join(", ");
  if (!active.length) return null;
  const repair = active[0] === "qa" && record(details.cr).status === "blocked" && record(details.cr).blocker_type === "test_assets" && acceptedRepair(snapshot, "cr", "qa");
  if (active[0] === "qa" && (!selected.includes("cr") || (record(details.cr).status !== "passed" && !repair))) return "QA can run only when selected CR has passed or accepted test-asset repair is scoped";
  const qaRepair = active[0] === "dev" && selected.includes("qa") && record(details.qa).status === "blocked" && acceptedRepair(snapshot, "qa", "dev");
  const handoff = Array.isArray(snapshot.handoffs) ? record(snapshot.handoffs.at(-1)) : {}, work = record(snapshot.work_unit);
  const qaReturn = handoff.from === "qa" && handoff.to === "dev" && ["qa_failed", "qa_conditional"].includes(handoff.state) && handoff.work_unit_id === work.work_unit_id && handoff.reference_version === work.reference_version;
  const qaRework = active[0] === "dev" && (["qa_failed", "qa_conditional"].includes(status(snapshot.state)) || (status(snapshot.state) === "needs_revalidation" && (record(details.qa).status === "blocked" || qaReturn)));
  if (qaRework && (!qaRepair || !selected.includes("cr") || !["pending", "blocked"].includes(record(details.cr).status))) return "QA rework requires a scoped accepted handoff and invalidated CR approval";
  for (const role of selected.slice(0, selected.indexOf(active[0]))) {
    const prior = record(details[role]).status;
    // Missing historical status remains readable; explicit unfinished predecessors cannot be skipped.
    const retry = role === "cr" && ((qaRepair && ["pending", "blocked"].includes(prior)) || (prior === "blocked" && (repair || (active[0] === "dev" && acceptedRepair(snapshot, role, active[0])))));
    if (prior !== undefined && prior !== null && prior !== "" && prior !== "passed" && !retry) return "Serial workflow requires preceding role " + role + " to pass or hand off a scoped repair";
  }
  return null;
}
function activeRole(snapshot, selected) {
  if (STOPPED.has(status(snapshot.state)) || workflowError(snapshot, selected)) return null;
  return selected.find(role => record(record(snapshot.role_details)[role]).status === "running") || null;
}
function advance(timer, delta) {
  if (timer.active) timer.elapsed = Math.min(Number.MAX_SAFE_INTEGER, timer.elapsed + delta);
}
function withElapsed(value, timer) {
  return { ...record(value), metrics: { ...record(record(value).metrics), elapsed_ms: Math.floor(timer.elapsed) } };
}
function settle(previous, observed) {
  const entry = { observed: Math.max(previous.observed, observed), task: { ...previous.task }, roles: new Map([...previous.roles].map(([role, timer]) => [role, { ...timer }])) };
  const delta = Math.max(0, observed - previous.observed);
  for (const timer of [entry.task, ...entry.roles.values()]) { advance(timer, delta); timer.active = false; }
  return entry;
}

function createElapsedTracker({ now = () => performance.now(), maxViews = 128 } = {}) {
  if (!Number.isSafeInteger(maxViews) || maxViews < 1) throw new TypeError("maxViews must be a positive safe integer");
  const views = new Map();
  function observedTime() {
    const observed = now();
    if (!Number.isFinite(observed)) throw new TypeError("Elapsed clock must return a finite number");
    return observed;
  }
  function updatePure(snapshot, acceptSnapshot) {
    const previous = views.get(snapshot.view_id);
    if (!acceptSnapshot(snapshot)) return null;
    if (previous && STOPPED.has(status(snapshot.state))) views.set(snapshot.view_id, settle(previous, observedTime()));
    return snapshot;
  }
  function update(snapshot, acceptSnapshot = () => true) {
    // Pure views stay structurally unchanged, but an explicit stop still ends an existing interval.
    if (!object(snapshot.work_unit)) return updatePure(snapshot, acceptSnapshot);
    const previous = views.get(snapshot.view_id);
    if (!previous && views.size >= maxViews) throw new RangeError(`SC elapsed timer capacity reached (${maxViews} views); restart the server or reuse an existing view_id`);
    const observed = observedTime();
    // Rejected transport output must not change either the elapsed value or activity.
    const entry = previous ? settle(previous, observed) : { observed, task: stopwatch(snapshot.work_unit.metrics), roles: new Map() };
    const selected = selectedRoles(snapshot.work_unit.roles), active = activeRole(snapshot, selected);
    const details = record(snapshot.role_details), outputDetails = { ...details };
    for (const role of selected) {
      if (!entry.roles.has(role)) entry.roles.set(role, stopwatch(record(details[role]).metrics));
      const timer = entry.roles.get(role);
      timer.active = role === active;
      outputDetails[role] = withElapsed(details[role], timer);
    }
    entry.task.active = active !== null;
    const output = { ...snapshot, work_unit: withElapsed(snapshot.work_unit, entry.task), role_details: outputDetails };
    if (!acceptSnapshot(output)) return null;
    views.set(snapshot.view_id, entry);
    return output;
  }
  return { update };
}

module.exports = { createElapsedTracker, workflowError };
