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
  const narrow=innerWidth<=560;
  if(narrow) role.open=true;
  else { const summary=role.querySelector(':scope > summary'); summary.focus(); summary.dispatchEvent(new FocusEvent('focusin',{bubbles:true})); }
  const metrics=role.querySelector(':scope > summary .sc-task-view__role-elapsed');
  const task=root.querySelector('[data-sc-metric=task-elapsed]'),label=root.querySelector('[data-sc-task-elapsed-label]');
  const value=metrics?.querySelector('span'),box=metrics?.getBoundingClientRect(),valueBox=value?.getBoundingClientRect();
  const emptyValue=value?.textContent===''?{structure:metrics.childNodes.length===2&&metrics.firstChild.nodeType===Node.TEXT_NODE&&metrics.lastElementChild===value,termVisible:metrics.checkVisibility(),valueVisible:getComputedStyle(value).display!=='none'&&getComputedStyle(value).visibility==='visible',text:metrics.textContent,containerFits:metrics.scrollWidth<=metrics.clientWidth+1&&metrics.scrollHeight<=metrics.clientHeight+1,contained:valueBox.left>=box.left-1&&valueBox.right<=box.right+1&&valueBox.top>=box.top-1&&valueBox.bottom<=box.bottom+1}:null;
  const termRange=document.createRange();if(metrics)termRange.selectNode(metrics.firstChild);
  observations.push({name,narrow,viewport:innerWidth,previewMetrics:root.querySelectorAll('[data-sc-preview-metrics],.sc-task-view__role-metrics').length,reserveMetrics:root.querySelector('[data-sc-preview-size]').querySelectorAll('.sc-task-view__role-elapsed').length,rolePresent:!!metrics,roleHidden:metrics?.hidden??true,roleDisplay:metrics?getComputedStyle(metrics).display:'none',
    roleVisible:metrics?.checkVisibility()??false,taskHidden:task.hidden,labelHidden:label.hidden,
    taskDisplay:getComputedStyle(task).display,term:metrics?.firstChild.textContent??null,value:value?.textContent??null,emptyValue,
    belowStatus:!metrics||box.top>=role.querySelector(':scope > summary .sc-task-view__role-state').getBoundingClientRect().bottom,
    fits:!metrics||metrics.scrollWidth<=metrics.clientWidth+1,
    sameLine:!metrics||!value.textContent||Math.abs(termRange.getBoundingClientRect().top-value.getClientRects()[0].top)<2,
    titleCount:[...role.querySelectorAll('h3')].filter(n=>n.textContent==='执行耗时').length});
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
observe('fractional-finished',snapshot('completed','passed',1.5));
observe('null-finished',snapshot('completed','passed',null));
observe('nan-finished',snapshot('completed','passed',NaN));
observe('unsafe-finished',snapshot('completed','passed',Number.MAX_SAFE_INTEGER+1));
observe('long-finished',snapshot('completed','passed',Number.MAX_SAFE_INTEGER));
const headerLifecycle=[];
if(innerWidth>560){
  const input=snapshot('dev_in_progress','passed');input.view_id='header-same-view';input.role_details.cr.metrics={elapsed_ms:4000};
  const focus=role=>root.querySelector('[data-sc-role='+role+'] > summary').focus();
  const record=(name,role='qa')=>headerLifecycle.push({name,text:root.querySelector('[data-sc-role='+role+'] > summary .sc-task-view__role-elapsed')?.textContent||'',preview:root.querySelectorAll('[data-sc-preview-metrics],.sc-task-view__role-metrics').length,reserve:root.querySelectorAll('[data-sc-preview-size] .sc-task-view__role-elapsed').length});
  document.getElementById('focus-reset').focus();window.renderSurveyCorpsTaskView(root,input);focus('qa');record('passed');
  input.role_details.qa.metrics.elapsed_ms=3000;window.renderSurveyCorpsTaskView(root,input);record('refresh');
  focus('cr');record('switch-role','cr');
  input.role_details.qa.status='pending';window.renderSurveyCorpsTaskView(root,input);focus('qa');record('pending');
  input.role_details.qa.status='running';window.renderSurveyCorpsTaskView(root,input);record('running');
  document.getElementById('focus-reset').focus();input.state='completed';input.role_details.qa.status='passed';window.renderSurveyCorpsTaskView(root,input);record('summary');
}
document.body.dataset.headerResult=JSON.stringify(headerLifecycle);
document.body.dataset.testResult=JSON.stringify(observations);
parent.postMessage({elapsedResult:{observations,headerLifecycle}},'*');
</script></body>`;
// Keep temporary browser evidence for inspection; no files are removed.
for(const width of [360,960]) {
  const encodedHarness=harness.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const wrapper='<!doctype html><body><script>window.addEventListener("message",event=>{if(event.data.elapsedResult)document.body.dataset.elapsedResult=JSON.stringify(event.data.elapsedResult)});</script><iframe style="border:0;width:'+width+'px;height:1600px" srcdoc="'+encodedHarness+'"></iframe></body>';
  fs.writeFileSync(page,wrapper,"utf8");
  const run = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox",
    '--user-data-dir='+path.join(evidence,'profile-'+width), "--dump-dom",
    new URL('file:///'+page.replaceAll('\\','/')).href],
  { encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || "Chrome elapsed harness failed");
  fs.writeFileSync(path.join(evidence,'dom-'+width+'.html'),run.stdout,"utf8");
  const encoded=run.stdout.match(/data-elapsed-result="([^"]+)"/)?.[1];
  assert.ok(encoded,"Chrome must return completed observations; inspect evidence DOM for errors");
  const {observations,headerLifecycle}=JSON.parse(encoded.replaceAll('&quot;','"').replaceAll('&amp;','&'));
  for(const item of observations) {
    const expected=item.name.startsWith('task-finished:')||item.name.endsWith('-finished')||item.name==='finished-before-resume';
    const roleExpected=(expected&&!item.name.startsWith('task-finished:'))||item.name==='task-running-role-completed'||item.name==='role-passed';
    const taskExpected=expected||item.name==='task-completed-role-running';
    assert.equal(item.viewport,width,'elapsed layout must use the requested viewport');
    assert.equal(item.roleHidden,!roleExpected,item.name);
    assert.equal(item.roleDisplay==='none',!roleExpected,item.name);
    assert.equal(item.roleVisible,roleExpected,item.name);
    assert.equal(item.taskHidden,!taskExpected,item.name);
    assert.equal(item.labelHidden,!taskExpected,item.name);
    assert.equal(item.taskDisplay==='none',!taskExpected,item.name);
    assert.equal(item.rolePresent,roleExpected,item.name+' only exact passed may show role elapsed');
    assert.equal(item.term,roleExpected?'耗时 ':null,item.name);
    assert.equal(item.previewMetrics,0,item.name+' preview must not duplicate left-card elapsed');
    assert.equal(item.reserveMetrics,0,item.name+' reserve must not duplicate left-card elapsed');
    assert.equal(item.titleCount,0,item.name);
    assert.equal(item.belowStatus,true,item.name+' elapsed must stay below status');
    assert.equal(item.fits,true,item.name+' elapsed must wrap within its column');
    if(item.value==='')assert.deepEqual(item.emptyValue,{structure:true,termVisible:true,valueVisible:true,text:'耗时 ',containerFits:true,contained:true},item.name+' invalid values keep only the elapsed label without placeholders');
    else if(item.name!=='long-finished')assert.equal(item.sameLine,true,item.name);
    const invalid=['absent-metrics-finished','negative-finished','string-finished','fractional-finished','null-finished','nan-finished','unsafe-finished'];
    const expectedValue=item.name==='zero-finished'?'0毫秒':invalid.includes(item.name)?'':item.name==='long-finished'?'104249991天 08小时 59分 00秒':'2秒';
    assert.equal(item.value,roleExpected?expectedValue:null,item.name);
  }
  if(width>560)assert.deepEqual(headerLifecycle,[['passed','耗时 2秒'],['refresh','耗时 3秒'],['switch-role','耗时 4秒'],['pending',''],['running',''],['summary','耗时 3秒']].map(([name,text])=>({name,text,preview:0,reserve:0})),'left-card elapsed must update, clear on reopen and remain after task summary');
  fs.writeFileSync(path.join(evidence,'lifecycle-'+width+'.json'),JSON.stringify(headerLifecycle,null,2),'utf8');
  fs.writeFileSync(path.join(evidence,'observations-'+width+'.json'),JSON.stringify(observations,null,2),'utf8');
  console.log('Elapsed visibility Chrome behavior passed ('+width+'px, '+observations.length+' cases); evidence: '+evidence);
}
