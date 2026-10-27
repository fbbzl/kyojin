"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { startServer } = require("./test-stdio-helper");

// QA-SC-SERIAL-WORKFLOW: P1 UI and protocol contract.
// Oracle: one active role, ordered DEV -> CR -> QA; rejection retains last valid input.
const task = (viewId = "qa-serial-workflow") => ({
  view_id: viewId,
  state: "dev_in_progress",
  work_unit: { work_unit_id: "QA-SC-SERIAL-WORKFLOW", roles: ["dev", "cr", "qa"] },
  role_details: {
    dev: { status: "running" },
    cr: { status: "pending" },
    qa: { status: "pending" },
  },
});

function chromeBehavior() {
  const chrome = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ].find(fs.existsSync);
  assert.ok(chrome, "Chrome is required for independent UI behavior validation");
  const template = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sc-serial-workflow-"));
  const page = path.join(temp, "test.html");
  const harness = `<!doctype html><html><body><main id="root">${template}</main><script>
    const root=document.getElementById('root'), initial=${JSON.stringify(task())};
    window.onerror=message=>document.body.dataset.testError=String(message);
    const status=role=>root.querySelector('[data-sc-role="'+role+'"] .sc-task-view__role-state').textContent;
    const observe=()=>({
      active:[...root.querySelectorAll('[data-sc-role].is-active')].map(node=>node.dataset.scRole),
      open:[...root.querySelectorAll('[data-sc-role][open]')].map(node=>node.dataset.scRole),
      current:[...root.querySelectorAll('[data-sc-role][aria-current=step]')].map(node=>node.dataset.scRole)
    });
    const render=value=>window.renderSurveyCorpsTaskView(root,value);
    const result={};
    const beforeInitial=JSON.stringify(initial);render(initial);
    result.dev={dev:status('dev'),cr:status('cr'),qa:status('qa'),...observe(),unchanged:beforeInitial===JSON.stringify(initial)};
    initial.role_details.dev.phase='pre_review';
    initial.role_details.cr.phase='testing';
    initial.role_details.qa.phase='test_preparation';
    const beforePhase=JSON.stringify(initial);render(initial);
    result.phase={dev:status('dev'),cr:status('cr'),qa:status('qa'),...observe(),unchanged:beforePhase===JSON.stringify(initial)};
    const devNode=root.querySelector('[data-sc-role=dev]');devNode.open=false;
    const devSummary=devNode.querySelector(':scope > summary');devSummary.focus();render(initial);
    result.foldFocus={...observe(),focus:document.activeElement===root.querySelector('[data-sc-role=dev] > summary')};
    const crRunning=structuredClone(initial);
    crRunning.state='ready_for_cr';
    crRunning.role_details={dev:{status:'passed'},cr:{status:'running'},qa:{status:'pending'}};
    const beforeCr=JSON.stringify(crRunning);render(crRunning);
    result.cr={dev:status('dev'),cr:status('cr'),qa:status('qa'),...observe(),unchanged:beforeCr===JSON.stringify(crRunning)};
    const qaRunning=structuredClone(crRunning);
    qaRunning.state='ready_for_qa';
    qaRunning.role_details={dev:{status:'passed'},cr:{status:'passed'},qa:{status:'running'}};
    const beforeQa=JSON.stringify(qaRunning);render(qaRunning);
    result.qa={dev:status('dev'),cr:status('cr'),qa:status('qa'),...observe(),unchanged:beforeQa===JSON.stringify(qaRunning)};
    const conflict=structuredClone(qaRunning);
    conflict.role_details={dev:{status:'running'},cr:{status:'running'},qa:{status:'pending'}};
    const beforeConflict=JSON.stringify(conflict);render(conflict);
    result.conflict={...observe(),unchanged:beforeConflict===JSON.stringify(conflict)};
    result.qaGate=[];
    for(const crStatus of ['pending','running','blocked','needs_user_confirm',undefined,'completed',' PASSED ']){
      const invalid=structuredClone(qaRunning);invalid.role_details.cr=crStatus===undefined?{}:{status:crStatus};
      const before=JSON.stringify(invalid);render(invalid);
      result.qaGate.push({name:String(crStatus),...observe(),qa:status('qa'),unchanged:before===JSON.stringify(invalid)});
    }
    for(const roles of [['dev','qa'],['qa'],'qa']){
      const invalid=structuredClone(qaRunning);invalid.work_unit.roles=roles;
      const before=JSON.stringify(invalid);render(invalid);
      result.qaGate.push({name:JSON.stringify(roles),...observe(),qa:status('qa'),unchanged:before===JSON.stringify(invalid)});
    }
    const missingCr=structuredClone(qaRunning);delete missingCr.role_details.cr;
    const beforeMissingCr=JSON.stringify(missingCr);render(missingCr);
    result.qaGate.push({name:'missing-cr-detail',...observe(),qa:status('qa'),unchanged:beforeMissingCr===JSON.stringify(missingCr)});
    const scalar=structuredClone(initial);scalar.work_unit.roles=' DEV ';render(scalar);
    result.scalarDev=observe();
    result.terminals=[];
    for(const [state,label] of [['passed','已完成'],['qa_success','测试通过'],['skipped','已跳过']]){const value=structuredClone(initial);value.state=state;render(value);result.terminals.push({state,label:root.querySelector('[data-sc-field=state]').textContent,...observe(),shimmer:root.querySelectorAll('.is-status-running').length});}
    const skipped=structuredClone(initial);skipped.work_unit.roles=['cr','dev','qa'];skipped.role_details={cr:{status:'pending'},dev:{status:'running'},qa:{status:'pending'}};render(skipped);result.skippedPredecessor=observe();
    const repair={view_id:'repair',state:'cr_blocked',work_unit:{roles:['cr','qa'],work_unit_id:'repair',reference_version:'v1'},role_details:{cr:{status:'blocked',blocker_type:'test_assets'},qa:{status:'running'}},handoffs:[{from:'cr',to:'qa',state:'cr_blocked',handoff_result:'accepted',work_unit_id:'repair',reference_version:'v1',files:['test.js'],decision:'Repair asset only',next_action:'CR review before testing'}]};render(repair);result.repair=observe();repair.handoffs[0].reference_version='old';render(repair);result.staleRepair=observe();
    const qaRepair=structuredClone(repair);qaRepair.state='qa_failed';qaRepair.work_unit.roles=['cr','dev','qa'];qaRepair.role_details={cr:{status:'pending'},dev:{status:'running'},qa:{status:'blocked'}};Object.assign(qaRepair.handoffs[0],{from:'qa',to:'dev',state:'qa_failed',reference_version:'v1'});
    result.qaRepairs=[];for(const roles of [['cr','dev','qa'],['dev','cr','qa'],['req','dev','cr','qa']])for(const state of ['qa_failed','qa_conditional','needs_revalidation'])for(const status of ['pending','blocked']){const value=structuredClone(qaRepair);value.work_unit.roles=roles;value.role_details.req={status:'passed'};value.state=state;value.resume_state='dev_in_progress';value.handoffs[0].state=state==='needs_revalidation'?'qa_failed':state;value.role_details.cr.status=status;render(value);result.qaRepairs.push(observe());}
    result.invalidRepairs=[];repair.handoffs[0].reference_version='v1';
    for(const source of [repair,qaRepair])for(const path of ['https://example.test/test.js','../test.js','src/../test.js','//server/share/test.js',...[10,127,128,159].map(code=>'src/test'+String.fromCharCode(code)+'.js')]){const value=structuredClone(source);value.handoffs[0].files=[path];render(value);result.invalidRepairs.push(observe());}
    for(const roles of [['cr','dev','qa'],['dev','cr','qa'],['req','dev','cr','qa']])for(const state of ['qa_failed','qa_conditional','needs_revalidation'])for(const mutate of [v=>{v.handoffs=[];},v=>{v.handoffs.push({...v.handoffs[0],handoff_result:'pending'});},v=>{v.handoffs[0].reference_version='old';},v=>{v.handoffs[0].files=[];},v=>{v.role_details.qa.status='pending';},v=>{v.role_details.cr.status='passed';},v=>{v.state='needs_revalidation';v.resume_state='ready_for_qa';}]){const value=structuredClone(qaRepair);value.work_unit.roles=roles;value.role_details.req={status:'passed'};value.state=state;value.resume_state='dev_in_progress';value.handoffs[0].state=state==='needs_revalidation'?'qa_failed':state;mutate(value);render(value);result.invalidRepairs.push(observe());}
    result.changedRequirements=[];for(const history of [{to:'sc',state:'qa_passed',reference_version:'v1'},{to:'dev',state:'qa_failed',reference_version:'v1'},{to:'dev',state:'qa_failed',work_unit_id:'other',reference_version:'v2'}]){const value=structuredClone(initial);value.state='needs_revalidation';value.resume_state='dev_in_progress';Object.assign(value.work_unit,{work_unit_id:'w1',reference_version:'v2'});value.handoffs=[{...qaRepair.handoffs[0],work_unit_id:'w1',...history}];render(value);result.changedRequirements.push(observe());}
    result.stoppedRepairs=[];
    for(const state of ['cr_blocked','qa_failed','qa_conditional','needs_revalidation'])for(const stop of ['paused','needs_user_confirm']){const source=structuredClone(state==='cr_blocked'?repair:qaRepair),active=state==='cr_blocked'?'qa':'dev';source.state=state;source.resume_state='dev_in_progress';source.handoffs[0].state=state==='needs_revalidation'?'qa_failed':state;render({...source,state:stop});result.stoppedRepairs.push({phase:'stopped',activeRole:active,...observe()});const invalid=structuredClone(source);invalid.handoffs=[];render(invalid);result.stoppedRepairs.push({phase:'rejected',activeRole:active,...observe()});render(source);result.stoppedRepairs.push({phase:'resumed',activeRole:active,...observe()});}
    document.body.dataset.testResult=JSON.stringify(result);
  </script></body></html>`;
  fs.writeFileSync(page, harness, "utf8");
  const run = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox",
    `--user-data-dir=${path.join(temp, "profile")}`, "--dump-dom",
    new URL(`file:///${page.replaceAll("\\", "/")}`).href],
  { encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || "Chrome serial workflow harness failed");
  const encoded = run.stdout.match(/data-test-result="([^"]+)"/)?.[1];
  assert.ok(encoded, "Chrome must return completed behavioral observations");
  const result = JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  assert.deepEqual(result.dev, { dev: "进行中", cr: "待开始", qa: "待开始", active: ["dev"], open: ["dev"], current: ["dev"], unchanged: true });
  assert.deepEqual(result.phase, { dev: "进行中", cr: "待开始", qa: "待开始", active: ["dev"], open: ["dev"], current: ["dev"], unchanged: true });
  assert.deepEqual(result.foldFocus, { active: ["dev"], open: [], current: ["dev"], focus: true });
  assert.deepEqual(result.cr, { dev: "通过", cr: "进行中", qa: "待开始", active: ["cr"], open: ["cr"], current: ["cr"], unchanged: true });
  assert.deepEqual(result.qa, { dev: "通过", cr: "通过", qa: "进行中", active: ["qa"], open: ["qa"], current: ["qa"], unchanged: true });
  assert.deepEqual(result.conflict, { active: [], open: [], current: [], unchanged: true });
  for(const item of result.qaGate) assert.deepEqual(item, {name:item.name,active:[],open:[],current:[],qa:'进行中',unchanged:true}, `${item.name}: invalid QA snapshots must stay inert and preserve their raw status`);
  assert.deepEqual(result.scalarDev, {active:['dev'],open:['dev'],current:['dev']}, "scalar and array role selection must normalize consistently");
  for(const item of result.terminals)assert.deepEqual(item,{state:item.state,label:{passed:'已完成',qa_success:'测试通过',skipped:'已跳过'}[item.state],active:[],open:[],current:[],shimmer:0},'terminal DOM must suppress stale running activity');
  for(const item of [result.skippedPredecessor,result.staleRepair])assert.deepEqual(item,{active:[],open:[],current:[]});
  assert.deepEqual(result.repair,{active:['qa'],open:['qa'],current:['qa']},'scoped repair remains visible as QA work');
  for(const item of result.qaRepairs)assert.deepEqual(item,{active:['dev'],open:['dev'],current:['dev']},'bound QA rework may run DEV while CR approval is invalidated');
  for(const item of result.invalidRepairs)assert.deepEqual(item,{active:[],open:[],current:[]},'invalid path or repair authority must suppress browser activity');
  for(const item of result.changedRequirements)assert.deepEqual(item,{active:['dev'],open:['dev'],current:['dev']},'historical QA handoffs must not block a new requirement');
  for(const item of result.stoppedRepairs){const roles=item.phase==='resumed'?[item.activeRole]:[];assert.deepEqual(item,{phase:item.phase,activeRole:item.activeRole,active:roles,open:roles,current:roles},'global stops suppress repair activity; only valid resume reactivates the role');}
  console.log(`Serial workflow Chrome behavior passed; browser evidence: ${page}`);
}

async function stdioContract() {
  let id = 0;
  const pending = new Map();
  const session = startServer({ timeoutMs: 15000, onReply(reply) {
    const request = pending.get(reply.id);
    assert.ok(request, "unexpected stdio response");
    pending.delete(reply.id);
    request.resolve(reply);
  }, onFailure(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    process.exitCode = 1;
  } });
  const call = async snapshot => {
    const requestId = ++id;
    const reply = await new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      const args = snapshot === undefined ? {} : { snapshot };
      session.server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call",
        params: { name: "show_sc_task_view", arguments: args } }) + "\n");
    });
    return reply;
  };
  const expectAccepted = async snapshot => {
    const reply = await call(snapshot);
    assert.equal(reply.error, undefined, JSON.stringify(reply.error));
    return reply.result.structuredContent.snapshot;
  };
  const latest = async () => (await expectAccepted()).role_details;
  try {
    const dev = task();
    const acceptedDev = await expectAccepted(dev);
    assert.equal(acceptedDev.role_details.dev.status, "running");
    assert.equal(acceptedDev.role_details.cr.status, "pending");
    assert.equal(acceptedDev.role_details.qa.status, "pending");

    const cr = structuredClone(dev);
    cr.state = "ready_for_cr";
    cr.role_details = { dev: { status: "passed" }, cr: { status: "running" }, qa: { status: "pending" } };
    const acceptedCr = await expectAccepted(cr);
    assert.equal(acceptedCr.role_details.cr.status, "running");

    const qa = structuredClone(cr);
    qa.state = "ready_for_qa";
    qa.role_details = { dev: { status: "passed" }, cr: { status: "passed" }, qa: { status: "running" } };
    const acceptedQa = await expectAccepted(qa);
    assert.equal(acceptedQa.role_details.qa.status, "running");

    const conflict = structuredClone(qa);
    conflict.role_details.cr.status = "running";
    const rejectedConflict = await call(conflict);
    assert.equal(rejectedConflict.error?.code, -32602);
    assert.match(rejectedConflict.error.message, /only one active role/i);
    const stoppedQa = await expectAccepted({ ...qa, state: "needs_user_confirm", role_details: { ...qa.role_details, qa: { status: "needs_user_confirm" } } });
    const invalidStatuses = ["completed", "waiting", "not_started", "preparing", "in-progress", "in_progress", "working", "active", "started", "started_working", " RUNNING ", "running ", "", null, 42, false, {}, []];
    for (const status of invalidStatuses) {
      const invalid = structuredClone(qa);
      invalid.role_details.cr.status = status;
      const rejected = await call(invalid);
      assert.equal(rejected.error?.code, -32602, "invalid role status: " + JSON.stringify(status));
      assert.match(rejected.error.message, /status must be one of/i);
      assert.deepEqual(await latest(), stoppedQa.role_details, "rejection must retain the latest valid roles and elapsed metrics");
    }
    // Global stops halt repair activity; resuming still needs the bound handoff.
    const repair = { view_id: "stop-repair", state: "cr_blocked", work_unit: { roles: ["cr", "dev", "qa"], work_unit_id: "repair", reference_version: "v1" }, role_details: { cr: { status: "blocked", blocker_type: "test_assets" }, dev: { status: "passed" }, qa: { status: "running" } }, handoffs: [{ from: "cr", to: "qa", state: "cr_blocked", handoff_result: "accepted", work_unit_id: "repair", reference_version: "v1", files: ["test.js"], decision: "Repair asset only", next_action: "CR review before testing" }] };
    for (const state of ["cr_blocked", "qa_failed", "qa_conditional", "needs_revalidation"]) for (const stop of ["paused", "needs_user_confirm"]) {
      const source = structuredClone(repair), active = state === "cr_blocked" ? "qa" : "dev";
      source.view_id += "-" + state + "-" + stop; source.state = state;
      if (active === "dev") {
        source.resume_state = "dev_in_progress";
        source.role_details = { cr: { status: "pending" }, dev: { status: "running" }, qa: { status: "blocked" } };
        Object.assign(source.handoffs[0], { from: "qa", to: "dev", state: state === "needs_revalidation" ? "qa_failed" : state });
      }
      await expectAccepted(source); await delay(60);
      const stopped = structuredClone(source); stopped.state = stop; stopped.role_details[active].status = "pending";
      const frozen = await expectAccepted(stopped);
      assert.ok(frozen.work_unit.metrics.elapsed_ms >= 20);
      assert.equal(frozen.work_unit.metrics.elapsed_ms, frozen.role_details[active].metrics.elapsed_ms);
      await delay(60);
      assert.deepEqual(await expectAccepted(), frozen, "empty restore must freeze every stopped task/role timer");
      const invalid = { ...source, handoffs: [] }, rejected = await call(invalid);
      assert.equal(rejected.error?.code, -32602);
      assert.match(rejected.error.message, /QA can run only|preceding role|QA rework/);
      const malformed = structuredClone(stopped); malformed.role_details[active].status = "working";
      assert.match((await call(malformed)).error?.message, /status must be one of/);
      await delay(20);
      assert.deepEqual(await expectAccepted(), frozen, "rejected resume and invalid stopped schema must preserve frozen cache");
      const resumed = await expectAccepted(source);
      assert.equal(resumed.role_details[active].status, "running");
      assert.deepEqual(resumed.role_details[active].metrics, frozen.role_details[active].metrics, "valid resume excludes the stopped interval");
      for (const role of source.work_unit.roles.filter(role => role !== active)) assert.deepEqual(resumed.role_details[role], frozen.role_details[role]);
      assert.deepEqual(resumed.work_unit, frozen.work_unit);
      await delay(60);
      const progressed = await expectAccepted();
      assert.ok(progressed.work_unit.metrics.elapsed_ms >= frozen.work_unit.metrics.elapsed_ms + 20);
      assert.ok(progressed.role_details[active].metrics.elapsed_ms >= frozen.role_details[active].metrics.elapsed_ms + 20);
      for (const role of source.work_unit.roles.filter(role => role !== active)) assert.deepEqual(progressed.role_details[role], frozen.role_details[role]);
      await expectAccepted(stopped);
    }
    console.log("Serial workflow stdio passed (DEV → CR → QA; strict status rejection).");
  } finally {
    session.complete();
  }
}

async function main() {
  chromeBehavior();
  await stdioContract();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
