"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// QA-SC-ELAPSED-VISIBILITY, P1: final snapshot values are shown only after
// the corresponding task or role finishes; reopening hides the stale value.
// Preconditions: Windows Chrome, Node. Oracle: user-approved terminal-only UI.
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(fs.existsSync);
assert.ok(chrome, "Chrome is required for elapsed visibility validation");
const template = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "sc-elapsed-visibility-"));
const page = path.join(evidence, "test.html");
const harness = `<!doctype html><meta charset="utf-8"><body><button id="focus-reset" type="button" tabindex="-1" aria-hidden="true" style="position:fixed;left:-10000px;opacity:0"></button><main id="root">${template}</main><script>
window.onerror=message=>document.body.dataset.testError=String(message);
const root=document.getElementById('root'),observations=[];let observationSequence=0;
const snapshot=(state,roleStatus,elapsed=2000)=>({view_id:'qa-elapsed-'+(++observationSequence)+'-'+String(state)+'-'+String(roleStatus),state,
  work_unit:{work_unit_id:'QA-SC-ELAPSED-VISIBILITY',roles:['cr','qa'],metrics:{elapsed_ms:elapsed}},
  role_details:{cr:{status:'passed'},qa:{status:roleStatus,metrics:{elapsed_ms:elapsed}}},handoffs:[]});
function observe(name,input){
  document.getElementById('focus-reset').focus();
  window.renderSurveyCorpsTaskView(root,input);
  const role=root.querySelector('[data-sc-role=qa]');
  const detail=innerWidth<=560?role:root.querySelector('[data-sc-preview-body]');
  if(innerWidth<=560) role.open=true;
  else { const summary=role.querySelector(':scope > summary'); summary.focus(); summary.dispatchEvent(new FocusEvent('focusin',{bubbles:true})); }
  const metrics=detail.querySelector('.sc-task-view__role-metrics');
  const task=root.querySelector('[data-sc-metric=task-elapsed]');
  const label=root.querySelector('[data-sc-task-elapsed-label]');
  const term=metrics?.querySelector('dt'),value=metrics?.querySelector('dd');
  observations.push({name,rolePresent:!!metrics,roleHidden:metrics?.hidden??true,roleDisplay:metrics?getComputedStyle(metrics).display:'none',
    roleVisible:metrics?.checkVisibility()??false,taskHidden:task.hidden,labelHidden:label.hidden,
    taskDisplay:getComputedStyle(task).display,term:term?.textContent??null,value:value?.textContent??null,
    sameLine:!metrics||metrics.hidden||Math.abs(term.getBoundingClientRect().top-value.getBoundingClientRect().top)<2,
    titleCount:[...detail.querySelectorAll('h3')].filter(n=>n.textContent==='执行耗时').length});
}
const unfinished=[undefined,null,'','pending','not_started','running','preparing','in_progress',
  'paused','waiting','waiting_user','needs_user_confirm','blocked','unknown','future_status',
  'needs_revision','needs_revalidation','ready_for_cr','ready_for_qa','qa_failed','qa_conditional'];
for(const status of unfinished)observe('unfinished:'+String(status),snapshot(status,status));
const taskFinished=['completed','complete','done','success','successful','succeeded','passed',
  'qa_passed','qa_success','workflow_ready','failed','cancelled','canceled','skipped',' COMPLETED '];
for(const status of taskFinished)observe('task-finished:'+status,snapshot(status,'pending'));
for(const status of taskFinished.filter(status=>status!=='passed'))observe('role-alias:'+status,snapshot('dev_in_progress',status));
observe('role-passed',snapshot('dev_in_progress','passed'));
observe('task-running-role-completed',snapshot('dev_in_progress','passed'));
observe('task-completed-role-running',snapshot('completed','running'));
observe('finished-before-resume',snapshot('completed','passed'));
observe('resumed-running',snapshot('dev_in_progress','running'));
observe('zero-finished',snapshot('completed','passed',0));
observe('missing-finished',snapshot('completed','passed',undefined));
const missing=snapshot('completed','passed');delete missing.work_unit.metrics;delete missing.role_details.qa.metrics;
observe('absent-metrics-finished',missing);
observe('negative-finished',snapshot('completed','passed',-1));
observe('string-finished',snapshot('completed','passed','2000'));
document.body.dataset.testResult=JSON.stringify(observations);
</script></body>`;
// Keep temporary browser evidence for inspection; no files are removed.
fs.writeFileSync(page, harness, "utf8");
const run = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox",
  `--user-data-dir=${path.join(evidence, "profile")}`, "--dump-dom",
  new URL(`file:///${page.replaceAll("\\", "/")}`).href],
{ encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr || "Chrome elapsed harness failed");
fs.writeFileSync(path.join(evidence, "dom.html"), run.stdout, "utf8");
const encoded = run.stdout.match(/data-test-result="([^"]+)"/)?.[1];
assert.ok(encoded, "Chrome must return completed observations; inspect evidence DOM for errors");
const observations = JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
for (const item of observations) {
  let expected = item.name.startsWith("task-finished:") || item.name.endsWith("-finished") || item.name === "finished-before-resume";
  const roleExpected = (expected && !item.name.startsWith("task-finished:")) || item.name === "task-running-role-completed" || item.name === "role-passed";
  const taskExpected = expected || item.name === "task-completed-role-running";
  assert.equal(item.roleHidden, !roleExpected, item.name);
  assert.equal(item.roleDisplay === "none", !roleExpected, item.name);
  assert.equal(item.roleVisible, roleExpected, item.name);
  assert.equal(item.taskHidden, !taskExpected, item.name);
  assert.equal(item.labelHidden, !taskExpected, item.name);
  assert.equal(item.taskDisplay === "none", !taskExpected, item.name);
  const pendingBody=item.name==='unfinished:pending'||item.name.startsWith('task-finished:');
  assert.equal(item.rolePresent,!pendingBody,item.name);
  assert.equal(item.term, pendingBody?null:"执行耗时:", item.name);
  assert.equal(item.titleCount, 0, item.name);
  assert.ok(item.sameLine, item.name);
  const expectedValue = item.name === "zero-finished" ? "0毫秒" :
    ["absent-metrics-finished", "negative-finished", "string-finished"].includes(item.name) ? "未提供" : "2秒";
  assert.equal(item.value, pendingBody?null:expectedValue, item.name);
}
fs.writeFileSync(path.join(evidence, "observations.json"), JSON.stringify(observations, null, 2), "utf8");
console.log(`Elapsed visibility Chrome behavior passed (${observations.length} cases); evidence: ${evidence}`);
