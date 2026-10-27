"use strict";
const assert = require("node:assert/strict");
const { startServer } = require("./test-stdio-helper");
const base = { view_id: "serial-regression", state: "dev_in_progress", work_unit: { roles: ["dev", "cr", "qa"] }, role_details: { dev: { status: "running" }, cr: { status: "pending" }, qa: { status: "pending" } } };
const next = { ...base, state: "ready_for_cr", role_details: { dev: { status: "passed" }, cr: { status: "running" }, qa: { status: "pending" } } };
const conflict = { ...base, role_details: { dev: { status: "running" }, cr: { status: "running" }, qa: { status: "pending" } } };
const qa = { ...base, state: "needs_user_confirm", role_details: { dev: { status: "passed" }, cr: { status: "passed" }, qa: { status: "running" } } };
const snapshots = [{ snapshot: base }, { snapshot: next }, { snapshot: qa }, { snapshot: conflict, error: /only one active role/ }, {}];
for (const status of ["pending", "running", "blocked", "needs_user_confirm", undefined]) {
  snapshots.push({ snapshot: { ...qa, role_details: { dev: { status: "passed" }, cr: status === undefined ? {} : { status }, qa: { status: "running" } } }, error: status === "running" ? /only one active role/ : /QA can run only when selected CR has passed/ }, {});
}
for (const roles of [["dev", "qa"], ["qa"], "qa"]) {
  snapshots.push({ snapshot: { ...qa, work_unit: { roles } }, error: /QA can run only when selected CR has passed/ }, {});
}
snapshots.push({ snapshot: { ...qa, role_details: { dev: { status: "passed" }, qa: { status: "running" } } }, error: /QA can run only when selected CR has passed/ }, {});
// SC order/repair boundary: rejected snapshots preserve the stopped cache and all timers.
const repair={view_id:"scoped-repair",state:"cr_blocked",work_unit:{roles:["cr","dev","qa"],work_unit_id:"repair",reference_version:"v1"},role_details:{cr:{status:"blocked",blocker_type:"test_assets"},dev:{status:"passed"},qa:{status:"running"}},handoffs:[{from:"cr",to:"qa",state:"cr_blocked",handoff_result:"accepted",work_unit_id:"repair",reference_version:"v1",files:["test.js"],decision:"Repair test asset only",next_action:"Return to CR before formal testing"}]};
snapshots.push({snapshot:{...qa,state:"paused"}});
const mutations=[v=>{v.handoffs=[];},v=>{v.handoffs.push({...v.handoffs[0],handoff_result:"pending"});},v=>{v.handoffs[0].work_unit_id="other";},v=>{v.handoffs[0].reference_version="old";},v=>{v.work_unit.reference_version="";},v=>{v.handoffs[0].from="dev";},v=>{v.handoffs[0].to="dev";},v=>{v.handoffs[0].state="ready_for_qa";},v=>{v.handoffs[0].files=[];},v=>{v.handoffs[0].files=[42];},v=>{v.handoffs[0].decision=" ";},v=>{delete v.handoffs[0].next_action;},v=>{v.role_details.cr.blocker_type="bug";},v=>{v.role_details.cr.status="pending";},v=>{v.work_unit.roles=["dev","qa"];},v=>{v.role_details.dev.status="pending";}];
for(const mutate of mutations){const value=structuredClone(repair);mutate(value);snapshots.push({snapshot:value,error:/QA can run only|preceding role/},{});}
for(const role of ["req","dev"]){
  snapshots.push({snapshot:{...base,work_unit:{roles:["cr",role]},role_details:{cr:{status:"pending"},[role]:{status:"running"}}},error:/preceding role cr/},{});
}
const forbidden=structuredClone(repair);forbidden.work_unit.roles=["cr","req"];forbidden.role_details={cr:{status:"blocked"},req:{status:"running"}};forbidden.handoffs[0].to="req";snapshots.push({snapshot:forbidden,error:/preceding role cr/},{});
const optimization={...base,work_unit:{roles:["cr","dev","qa"]},role_details:{cr:{status:"passed"},dev:{status:"running"},qa:{status:"pending"}}};
const devRepair=structuredClone(repair);devRepair.role_details={cr:{status:"blocked"},dev:{status:"running"},qa:{status:"pending"}};devRepair.handoffs[0].to="dev";
const review=structuredClone(repair);review.state="ready_for_cr";review.work_unit.reference_version="v2";review.role_details={cr:{status:"running"},dev:{status:"passed"},qa:{status:"pending"}};
const retest=structuredClone(review);retest.state="ready_for_qa";retest.role_details.cr.status="passed";retest.role_details.qa.status="running";
snapshots.push({snapshot:optimization},{snapshot:devRepair},{snapshot:repair},{snapshot:review},{snapshot:retest});
let step = 0;
let latest;
const { server, complete } = startServer({ onReply(reply) {
  const current = snapshots[step];
  if (current.error) {
    assert.equal(reply.error.code, -32602);
    assert.match(reply.error.message, current.error);
  } else if (current.snapshot) {
    assert.ok(reply.result);
    latest = reply.result.structuredContent.snapshot;
  } else {
    assert.deepEqual(reply.result.structuredContent.snapshot, latest, "rejected role transitions must preserve the last valid snapshot and all elapsed metrics");
  }
  if (++step === snapshots.length) {
    complete();
    console.log("Serial workflow handoff, CR prerequisite rejection and preserved snapshot passed.");
    return;
  }
  send();
} });
function send() {
  const current = snapshots[step];
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: step, method: "tools/call", params: { name: "show_sc_task_view", arguments: current.snapshot ? { snapshot: current.snapshot } : {} } }) + String.fromCharCode(10));
}
send();
