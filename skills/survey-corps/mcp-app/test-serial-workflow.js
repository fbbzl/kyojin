"use strict";
const assert = require("node:assert/strict");
const { startServer } = require("./test-stdio-helper");
const base = { view_id: "serial-regression", state: "dev_in_progress", work_unit: { roles: ["dev", "cr", "qa"] }, role_details: { dev: { status: "running" }, cr: { status: "pending" }, qa: { status: "pending" } } };
const next = { ...base, state: "ready_for_cr", role_details: { dev: { status: "passed" }, cr: { status: "running" }, qa: { status: "pending" } } };
const conflict = { ...base, role_details: { dev: { status: "running" }, cr: { status: "running" }, qa: { status: "pending" } } };
const qa = { ...base, state: "ready_for_qa", role_details: { dev: { status: "passed" }, cr: { status: "passed" }, qa: { status: "running" } } };
const stoppedQa = { ...qa, role_details: { ...qa.role_details, qa: { status: "pending" } } };
let scenario = 0;
const isolated = snapshot => ({ ...snapshot, view_id: `serial-scenario-${++scenario}` });
const snapshots = [{ snapshot: base }, { snapshot: next }, { snapshot: qa }, { snapshot: { ...stoppedQa, state: "needs_user_confirm" } }, { snapshot: conflict, error: /only one active role/ }, {}];
for (const status of ["pending", "running", "blocked", "needs_user_confirm", undefined]) {
  snapshots.push({ snapshot: { ...qa, role_details: { dev: { status: "passed" }, cr: status === undefined ? {} : { status }, qa: { status: "running" } } }, error: status === "running" ? /only one active role/ : /QA can run only when selected CR has passed/ }, {});
}
for (const roles of [["dev", "qa"], ["qa"], "qa"]) {
  snapshots.push({ snapshot: isolated({ ...qa, work_unit: { roles } }), error: /QA can run only when selected CR has passed/ }, {});
}
snapshots.push({ snapshot: { ...qa, role_details: { dev: { status: "passed" }, qa: { status: "running" } } }, error: /QA can run only when selected CR has passed/ }, {});
// SC order/repair boundary: rejected snapshots preserve the stopped cache and all timers.
const repair={view_id:"scoped-repair",state:"cr_blocked",work_unit:{roles:["cr","dev","qa"],work_unit_id:"repair",reference_version:"v1"},role_details:{cr:{status:"blocked",blocker_type:"test_assets"},dev:{status:"passed"},qa:{status:"running"}},handoffs:[{from:"cr",to:"qa",state:"cr_blocked",handoff_result:"accepted",work_unit_id:"repair",reference_version:"v1",files:["test.js"],decision:"Repair test asset only",next_action:"Return to CR before formal testing"}]};
snapshots.push({snapshot:{...stoppedQa,state:"paused"}});
const mutations=[{mutate:v=>{v.handoffs=[];}},{mutate:v=>{v.handoffs.push({...v.handoffs[0],handoff_result:"pending"});}},{mutate:v=>{v.handoffs[0].work_unit_id="other";}},{mutate:v=>{v.handoffs[0].reference_version="old";}},{mutate:v=>{v.work_unit.reference_version="";}},{mutate:v=>{v.handoffs[0].from="dev";}},{mutate:v=>{v.handoffs[0].to="dev";}},{mutate:v=>{v.handoffs[0].state="ready_for_qa";}},{mutate:v=>{v.handoffs[0].files=[];}},{mutate:v=>{v.handoffs[0].files=[42];},error:/files\/0 must be string/},{mutate:v=>{v.handoffs[0].decision=" ";}},{mutate:v=>{delete v.handoffs[0].next_action;}},{mutate:v=>{v.role_details.cr.blocker_type="bug";}},{mutate:v=>{v.role_details.cr.status="pending";}},{mutate:v=>{v.work_unit.roles=["dev","qa"];}},{mutate:v=>{v.role_details.dev.status="pending";}}];
for(const mutation of mutations){const value=isolated(structuredClone(repair));mutation.mutate(value);snapshots.push({snapshot:value,error:mutation.error||/QA can run only|preceding role/},{});}
for(const role of ["req","dev"]){
  snapshots.push({snapshot:isolated({...base,work_unit:{roles:["cr",role]},role_details:{cr:{status:"pending"},[role]:{status:"running"}}}),error:/preceding role cr/},{});
}
const forbidden=isolated(structuredClone(repair));forbidden.work_unit.roles=["cr","req"];forbidden.role_details={cr:{status:"blocked"},req:{status:"running"}};forbidden.handoffs[0].to="req";snapshots.push({snapshot:forbidden,error:/preceding role cr/},{});
const optimization=isolated({...base,work_unit:{roles:["cr","dev","qa"]},role_details:{cr:{status:"passed"},dev:{status:"running"},qa:{status:"pending"}}});
const devRepair=structuredClone(repair);devRepair.role_details={cr:{status:"blocked"},dev:{status:"running"},qa:{status:"pending"}};devRepair.handoffs[0].to="dev";
const repairDone=structuredClone(repair);repairDone.role_details.qa.status="passed";
const review=structuredClone(repairDone);review.state="ready_for_cr";review.work_unit.reference_version="v2";review.role_details={cr:{status:"running"},dev:{status:"passed"},qa:{status:"passed"}};
const retest=structuredClone(review);retest.state="ready_for_qa";retest.role_details.cr.status="passed";retest.role_details.qa.status="running";
snapshots.push({snapshot:optimization},{snapshot:devRepair},{snapshot:repair},{snapshot:repairDone},{snapshot:review},{snapshot:retest});
// QA-rework regression: invalidated CR approval must not prevent a bound QA -> DEV repair.
const qaRepair=structuredClone(devRepair);qaRepair.state="qa_failed";qaRepair.role_details.cr.status="pending";qaRepair.role_details.qa.status="blocked";Object.assign(qaRepair.handoffs[0],{from:"qa",state:"qa_failed"});
snapshots.push({snapshot:{...stoppedQa,state:"paused"}});
for(const source of [repair,qaRepair])for(const path of ["https://example.test/test.js","../test.js","src/../test.js","//server/share/test.js",...[10,127,128,159].map(code=>"src/test"+String.fromCharCode(code)+".js")]){const value=isolated(structuredClone(source));value.handoffs[0].files=[path];snapshots.push({snapshot:value,error:/QA can run only|preceding role|QA rework/},{});}
for(const roles of [["cr","dev","qa"],["dev","cr","qa"],["req","dev","cr","qa"]])for(const state of ["qa_failed","qa_conditional","needs_revalidation"]){
  const source=isolated(structuredClone(qaRepair));source.work_unit.roles=roles;source.role_details.req={status:"passed"};source.state=state;source.resume_state="dev_in_progress";source.handoffs[0].state=state==="needs_revalidation"?"qa_failed":state;
  for(const mutate of [v=>{v.handoffs=[];},v=>{v.handoffs.push({...v.handoffs[0],handoff_result:"pending"});},v=>{v.handoffs[0].reference_version="old";},v=>{v.handoffs[0].files=[];},v=>{v.role_details.qa.status="pending";},v=>{v.role_details.cr.status="passed";},v=>{v.state="needs_revalidation";v.resume_state="ready_for_qa";}]){const value=structuredClone(source);mutate(value);snapshots.push({snapshot:value,error:/preceding role cr|QA rework/},{});}
  const stopped=structuredClone(source);stopped.state="paused";stopped.role_details.dev.status="pending";
  snapshots.push({snapshot:source},{snapshot:stopped});
}
for(const state of ["qa_failed","qa_conditional","needs_revalidation"])for(const status of ["pending","blocked"]){const value=isolated(structuredClone(qaRepair));value.state=state;value.resume_state="dev_in_progress";value.handoffs[0].state=state==="needs_revalidation"?"qa_failed":state;value.role_details.cr.status=status;snapshots.push({snapshot:value});}
for(const history of [{to:"sc",state:"qa_passed",reference_version:"v1"},{to:"dev",state:"qa_failed",reference_version:"v1"},{to:"dev",state:"qa_failed",work_unit_id:"other",reference_version:"v2"}])snapshots.push({snapshot:isolated({...base,state:"needs_revalidation",resume_state:"dev_in_progress",work_unit:{roles:["dev","cr","qa"],work_unit_id:"w1",reference_version:"v2"},handoffs:[{...qaRepair.handoffs[0],work_unit_id:"w1",...history}]}),...(history.to==="sc"?{error:/handoffs\/0\/to must be equal to one of the allowed values/}:{})});
const finalReview=isolated({...review,role_details:{...review.role_details,qa:{status:"blocked"}}});
snapshots.push({snapshot:finalReview},{snapshot:{...retest,view_id:finalReview.view_id}});
let step = 0;
let latest;
const { server, complete } = startServer({ onReply(reply) {
  const current = snapshots[step];
  if (current.error) {
    assert.ok(reply.error, JSON.stringify({ step, expected: current.error, snapshot: current.snapshot, reply }));
    assert.equal(reply.error.code, -32602);
    assert.match(reply.error.message, current.error);
  } else if (current.snapshot) {
    assert.ok(reply.result, JSON.stringify({ step, expected: current, reply }));
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
