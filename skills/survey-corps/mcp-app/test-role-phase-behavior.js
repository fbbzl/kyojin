"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
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
    result.qaRepairs=[];for(const state of ['qa_failed','qa_conditional','needs_revalidation'])for(const status of ['pending','blocked']){const value=structuredClone(qaRepair);value.state=state;value.resume_state='dev_in_progress';value.handoffs[0].state=state==='needs_revalidation'?'qa_failed':state;value.role_details.cr.status=status;render(value);result.qaRepairs.push(observe());}
    result.invalidRepairs=[];repair.handoffs[0].reference_version='v1';
    for(const source of [repair,qaRepair])for(const path of ['https://example.test/test.js','../test.js','src/../test.js','//server/share/test.js','src/test'+String.fromCharCode(10)+'.js']){const value=structuredClone(source);value.handoffs[0].files=[path];render(value);result.invalidRepairs.push(observe());}
    for(const mutate of [v=>{v.handoffs=[];},v=>{v.handoffs.push({...v.handoffs[0],handoff_result:'pending'});},v=>{v.handoffs[0].reference_version='old';},v=>{v.state='needs_user_confirm';}]){const value=structuredClone(qaRepair);mutate(value);render(value);result.invalidRepairs.push(observe());}
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
    qa.state = "needs_user_confirm";
    qa.role_details = { dev: { status: "passed" }, cr: { status: "passed" }, qa: { status: "running" } };
    const acceptedQa = await expectAccepted(qa);
    assert.equal(acceptedQa.role_details.qa.status, "running");

    const conflict = structuredClone(qa);
    conflict.role_details.cr.status = "running";
    const rejectedConflict = await call(conflict);
    assert.equal(rejectedConflict.error?.code, -32602);
    assert.match(rejectedConflict.error.message, /only one active role/i);
    const invalidStatuses = ["completed", "waiting", "not_started", "preparing", "in-progress", "in_progress", "working", "active", "started", "started_working", " RUNNING ", "running ", "", null, 42, false, {}, []];
    for (const status of invalidStatuses) {
      const invalid = structuredClone(qa);
      invalid.role_details.cr.status = status;
      const rejected = await call(invalid);
      assert.equal(rejected.error?.code, -32602, "invalid role status: " + JSON.stringify(status));
      assert.match(rejected.error.message, /status must be one of/i);
      assert.deepEqual(await latest(), acceptedQa.role_details, "rejection must retain the latest valid roles and elapsed metrics");
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
