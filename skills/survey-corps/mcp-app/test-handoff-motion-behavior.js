"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

const chrome = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find(fs.existsSync);
assert.ok(chrome, "Chrome is required for the independent handoff motion regression");
const template = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sc-handoff-behavior-"));
const page = path.join(temp, "test.html");
const ownedChrome = new Set();

// Requirement source: the accepted SC handoff contract; inspect DOM/CSS output rather than private observation state.
const harness = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="seed">${template}</main><script>
window.onerror=(message,source,line,column)=>document.body.dataset.scTestError=String(message)+' at '+line+':'+column;
const seed=document.getElementById('seed'),pristine=seed.cloneNode(true),results={};
let sequence=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const makeRoot=()=>{const root=pristine.cloneNode(true);root.id='case-'+(++sequence);document.body.append(root);return root;};
const snapshot=(id='task')=>({view_id:'sc-task-view:'+id,state:'ready_for_cr',work_unit:{work_unit_id:id,roles:['req','dev','cr','qa']},role_details:{req:{status:'passed'},dev:{status:'passed'},cr:{status:'running'},qa:{status:'pending'}},handoffs:[]});
const handoff=(id,from='dev',to='cr',unit='task')=>({handoff_id:id,from,to,work_unit_id:unit,handoff_result:'accepted'});
const render=(root,value)=>window.renderSurveyCorpsTaskView(root,value);
const marked=root=>({flows:root.querySelectorAll('.is-handoff-flow').length,receivers:[...root.querySelectorAll('.is-handoff-receiving')].map(node=>node.dataset.scRole),reverse:root.querySelectorAll('.is-handoff-reverse').length});
const inspect=root=>{const connector=root.querySelector('.is-handoff-flow'),receiver=root.querySelector('.is-handoff-receiving');const flow=connector&&getComputedStyle(connector,'::before'),head=connector&&getComputedStyle(connector,'::after'),receive=receiver&&getComputedStyle(receiver,'::after');return {...marked(root),from:connector?.dataset.scConnectorFrom,to:connector?.dataset.scConnectorTo,hidden:connector?.getAttribute('aria-hidden'),flowAnimation:flow?.animationName,flowDuration:flow?.animationDuration,flowIterations:flow?.animationIterationCount,flowDirection:flow?.animationDirection,headTransform:head?.transform,headTop:head?.borderTopWidth,headBottom:head?.borderBottomWidth,headLeft:head?.borderLeftWidth,headRight:head?.borderRightWidth,headTopColor:head?.borderTopColor,headBottomColor:head?.borderBottomColor,headLeftColor:head?.borderLeftColor,headRightColor:head?.borderRightColor,color:connector&&getComputedStyle(connector).color,receiveAnimation:receive?.animationName,receiveDuration:receive?.animationDuration,receiveDelay:receive?.animationDelay,receiveIterations:receive?.animationIterationCount,receivePointerEvents:receive?.pointerEvents,activeAnimation:receiver&&getComputedStyle(receiver).animationName};};
const fresh=()=>{const root=makeRoot(),value=snapshot();render(root,value);return {root,value};};
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const settle=async()=>{await wait(0);await new Promise(requestAnimationFrame);await wait(0);};
const revealAnimations=root=>root.getAnimations({subtree:true}).filter(animation=>['sc-detail-reveal','sc-preview-reveal'].includes(animation.animationName)&&animation.effect.target.checkVisibility()&&getComputedStyle(animation.effect.target).animationName===animation.animationName);
const revealState=root=>({marked:root.querySelectorAll('.is-detail-revealing').length,animations:revealAnimations(root).map(animation=>({name:animation.animationName,transform:getComputedStyle(animation.effect.target).transform,duration:animation.effect.getTiming().duration,iterations:animation.effect.getTiming().iterations,role:animation.effect.target.closest('[data-sc-role]')?.dataset.scRole||null,skill:animation.effect.target.closest('[data-sc-preview-subskill]')?.dataset.scPreviewSubskill||animation.effect.target.closest('[data-sc-subskill]')?.dataset.scSubskill||null}))});
let keySequence=0;
const nativeKey=key=>new Promise(resolve=>{const id=++keySequence;const done=event=>{if(event.source!==parent||event.data.scInputDone!==id)return;window.removeEventListener('message',done);resolve();};window.addEventListener('message',done);parent.postMessage({scInputKey:{id,key}},'*');});
(async()=>{
  const {root,value}=fresh();results.initial=marked(root);
  value.handoffs.push(handoff('forward'));const before=JSON.stringify(value);render(root,value);results.forward=inspect(root);results.unchanged=JSON.stringify(value)===before;
  results.layout={viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,roleCount:root.querySelectorAll('[data-sc-role]').length};
  render(root,value);results.repeated=marked(root);
  value.role_details.cr.status='passed';value.role_details.dev.status='running';render(root,value);results.activeOnly=marked(root);
  value.handoffs.push(handoff('reverse','cr','dev'));render(root,value);results.reverse=inspect(root);
  const restored=makeRoot();render(restored,value);results.secondRoot=marked(restored);
  const refreshed=makeRoot();render(refreshed,structuredClone(value));results.refreshed=marked(refreshed);
  const other=snapshot('other');other.handoffs=[handoff('other-event','dev','cr','other')];render(root,other);results.newTask=marked(root);render(root,value);results.returnTask=marked(root);
  results.invalid={};
  const invalidCases={
    missingId:record=>{delete record.handoff_id;},emptyId:record=>{record.handoff_id=' ';},
    foreignUnit:record=>{record.work_unit_id='unrelated';},unknownRole:record=>{record.from='unknown';},
    sameRole:record=>{record.from='cr';},notAccepted:record=>{record.handoff_result='rejected';},
    pending:record=>{record.handoff_result='pending';},nonAdjacent:record=>{record.from='req';},
  };
  for(const [name,change] of Object.entries(invalidCases)){const sample=fresh(),record=handoff(name);change(record);sample.value.handoffs.push(record);render(sample.root,sample.value);results.invalid[name]=marked(sample.root);}
  for(const [name,unit] of Object.entries({null:null,number:42,empty:'',whitespace:' ',boolean:false,array:[],object:{}})){const sample=fresh(),record=handoff('invalid-unit-'+name);record.work_unit_id=unit;sample.value.handoffs.push(record);render(sample.root,sample.value);results.invalid['explicit-unit-'+name]=marked(sample.root);delete record.work_unit_id;sample.value.handoffs=[];render(sample.root,sample.value);sample.value.handoffs=[record];render(sample.root,sample.value);results.invalid['invalid-unit-consumed-'+name]=marked(sample.root);}
  {const sample=fresh(),record=handoff('optional-unit');delete record.work_unit_id;sample.value.handoffs.push(record);render(sample.root,sample.value);results.optionalUnit=marked(sample.root);}
  for(const direction of ['absent-to-invalid','invalid-to-absent']){const sample=fresh(),record=handoff('unit-prefix-'+direction);if(direction==='absent-to-invalid')delete record.work_unit_id;else record.work_unit_id=null;sample.value.handoffs=[record];render(sample.root,sample.value);if(direction==='absent-to-invalid')record.work_unit_id=null;else delete record.work_unit_id;sample.value.handoffs.push(handoff('after-unit-rewrite'));render(sample.root,sample.value);results.invalid[direction]=marked(sample.root);}
  for(const status of ['pending','passed','blocked','needs_user_confirm','waiting','preparing','working','completed',' RUNNING ']){const sample=fresh();sample.value.role_details.cr.status=status;sample.value.handoffs.push(handoff('not-running'));render(sample.root,sample.value);results.invalid['receiver-'+status]=marked(sample.root);sample.value.role_details.cr.status='running';render(sample.root,sample.value);results.invalid['receiver-resumed-'+status]=marked(sample.root);}
  {const sample=fresh();sample.value.role_details.dev.status='running';sample.value.handoffs.push(handoff('conflict'));render(sample.root,sample.value);results.invalid.conflict=marked(sample.root);sample.value.role_details.dev.status='passed';render(sample.root,sample.value);results.invalid.conflictRecovered=marked(sample.root);}
  for(const status of ['pending','running','blocked','needs_user_confirm',undefined,'completed',' PASSED ']){
    const sample=fresh();sample.value.state='ready_for_qa';sample.value.role_details.cr=status===undefined?{}:{status};sample.value.role_details.qa.status='running';
    sample.value.handoffs.push(handoff('qa-before-cr','cr','qa'));render(sample.root,sample.value);results.invalid['qa-before-cr-'+String(status)]=marked(sample.root);
    sample.value.role_details.cr.status='passed';render(sample.root,sample.value);results.invalid['qa-recovered-'+String(status)]=marked(sample.root);
  }
  {const sample=fresh();sample.value.state='ready_for_qa';sample.value.role_details.cr.status='passed';sample.value.role_details.qa.status='running';sample.value.work_unit.roles=['dev','qa'];sample.value.handoffs.push(handoff('qa-excluded-cr','dev','qa'));render(sample.root,sample.value);results.invalid.qaExcludedCr=marked(sample.root);sample.value.work_unit.roles=['dev','cr','qa'];render(sample.root,sample.value);results.invalid.qaIncludedCr=marked(sample.root);}
  {const sample=fresh();sample.value.state='ready_for_qa';sample.value.role_details.cr.status='passed';sample.value.role_details.qa.status='running';sample.value.handoffs.push(handoff('qa-after-passed-cr','cr','qa'));render(sample.root,sample.value);results.qaForward=inspect(sample.root);}
  {const sample=fresh();sample.value.work_unit.roles=['dev','qa'];sample.value.handoffs.push(handoff('excluded'));render(sample.root,sample.value);results.invalid.excluded=marked(sample.root);}
  {const sample=fresh();sample.value.handoffs=[{...handoff('duplicate'),handoff_result:'pending'}];render(sample.root,sample.value);sample.value.handoffs.push(handoff('duplicate'));render(sample.root,sample.value);results.invalid.duplicateIds=marked(sample.root);}
  {const sample=fresh();sample.value.handoffs=[handoff('first'),handoff('second')];render(sample.root,sample.value);results.invalid.batchHistory=marked(sample.root);}
  {const sample=fresh();sample.value.handoffs=[handoff('historic')];render(sample.root,sample.value);sample.value.handoffs=[];render(sample.root,sample.value);sample.value.handoffs=[handoff('historic')];render(sample.root,sample.value);results.invalid.reintroduced=marked(sample.root);}
  {const sample=fresh();sample.value.handoffs=[handoff('prefix')];render(sample.root,sample.value);sample.value.handoffs=[handoff('rewritten'),handoff('new')];render(sample.root,sample.value);results.invalid.rewritten=marked(sample.root);}
  {const sample=fresh();sample.value.handoffs=[{from:'dev',to:'cr',handoff_result:'accepted'}];render(sample.root,sample.value);results.legacy=marked(sample.root);results.legacyRoles=sample.root.querySelectorAll('[data-sc-role]').length;}
  {const sample=fresh();sample.value.handoffs=[handoff('pending-transition')];sample.value.handoffs[0].handoff_result='pending';render(sample.root,sample.value);sample.value.handoffs[0].handoff_result='accepted';render(sample.root,sample.value);results.acceptedTransition=marked(sample.root);render(sample.root,sample.value);results.transitionRepeated=marked(sample.root);}
  results.stops={};results.resumes={};
  for(const state of ['needs_user_confirm','paused','waiting','blocked','qa_passed','workflow_ready','completed','complete','done','success','successful','succeeded','failed','cancelled','canceled']){const sample=fresh();sample.value.state=state;sample.value.handoffs.push(handoff('stopped-'+state));render(sample.root,sample.value);results.stops[state]=marked(sample.root);sample.value.state='ready_for_cr';render(sample.root,sample.value);results.resumes[state]=marked(sample.root);}
  {const sample=fresh();sample.value.handoffs.push(handoff('interrupt'));render(sample.root,sample.value);sample.value.state='paused';render(sample.root,sample.value);results.interrupted=marked(sample.root);sample.value.state='ready_for_cr';render(sample.root,sample.value);results.interruptResume=marked(sample.root);}
  {const sample=fresh();const nativeMatchMedia=window.matchMedia;window.matchMedia=query=>query==='(prefers-reduced-motion:reduce)'?{matches:true}:nativeMatchMedia(query);sample.value.handoffs.push(handoff('reduced-consumed'));render(sample.root,sample.value);results.preferenceSuppressed=marked(sample.root);window.matchMedia=nativeMatchMedia;render(sample.root,sample.value);results.preferenceResumed=marked(sample.root);}
  {const sample=fresh();sample.root.querySelector('[data-sc-role=cr]').open=false;const req=sample.root.querySelector('[data-sc-role=req]');req.open=true;req.querySelector('summary').focus();sample.value.handoffs.push(handoff('focus'));render(sample.root,sample.value);results.focus={open:[...sample.root.querySelectorAll('[data-sc-role][open]')].map(node=>node.dataset.scRole),role:document.activeElement.closest('[data-sc-role]')?.dataset.scRole};}
  const finiteAnimations=root=>root.getAnimations({subtree:true}).filter(animation=>['sc-handoff-flow','sc-handoff-receive'].includes(animation.animationName));
  const cleanup=fresh();results.endEvents=[];const onHandoffEnd=event=>results.endEvents.push(event.animationName+'/'+event.pseudoElement);cleanup.root.addEventListener('animationend',onHandoffEnd);
  cleanup.value.handoffs.push(handoff('cleanup'));render(cleanup.root,cleanup.value);results.beforeCleanup=inspect(cleanup.root);
  cleanup.root.scrollIntoView({block:'start'});
  const ending=finiteAnimations(cleanup.root);await Promise.all(ending.map(animation=>animation.finished));await new Promise(requestAnimationFrame);await wait(0);
  results.afterCleanup=marked(cleanup.root);cleanup.root.removeEventListener('animationend',onHandoffEnd);render(cleanup.root,cleanup.value);results.afterCleanupUpdate=marked(cleanup.root);
  const again=structuredClone(cleanup.value);again.handoffs.push(handoff('next'));render(cleanup.root,again);results.nextEvent=marked(cleanup.root);
  const cancel=fresh();results.cancelEvents=[];cancel.root.addEventListener('animationcancel',event=>results.cancelEvents.push(event.animationName+'/'+event.pseudoElement));
  cancel.value.role_details.cr.status='passed';cancel.value.role_details.dev.status='running';cancel.value.handoffs.push(handoff('cancel','cr','dev'));render(cancel.root,cancel.value);results.beforeCancel=inspect(cancel.root);
  cancel.root.scrollIntoView({block:'start'});const cancelling=finiteAnimations(cancel.root);await Promise.all(cancelling.map(animation=>animation.ready));await wait(100);
  results.cancelClock=cancelling.map(animation=>({start:animation.startTime,time:animation.currentTime}));
  const stopStyle=document.createElement('style');stopStyle.textContent='#'+cancel.root.id+' .is-handoff-flow::before,#'+cancel.root.id+' .is-handoff-receiving::after{animation-name:none}';cancel.root.append(stopStyle);void cancel.root.offsetWidth;
  await new Promise(requestAnimationFrame);await wait(0);results.afterCancel=marked(cancel.root);
  // Requirement source: approved detail opening transition; use native details toggles and real CSS events.
  const detail=fresh(),detailResult=results.detail={starts:[],ends:[]};
  detail.value.role_details.dev.subskills=[{name:'tech-select',summary:'方案记录'},{name:'refactor-with-goal',summary:'等价证据'}];render(detail.root,detail.value);
  if(innerWidth>560){
    // Desktop details live in the independent preview; native disclosures must remain operable there.
    detail.value.role_details.cr.subskills=[{name:'review-with-goal',summary:'审查记录'}];render(detail.root,detail.value);
    const preview=()=>detail.root.querySelector('[data-sc-role-preview]'),body=()=>detail.root.querySelector('[data-sc-preview-body]'),skills=()=>[...preview().querySelectorAll('[data-sc-preview-subskill]')];
    const eventName=event=>event.target.closest('[data-sc-preview-subskill]')?.dataset.scPreviewSubskill||detail.root.querySelector('[data-sc-preview-link]:not([hidden])').closest('[data-sc-role]').dataset.scRole;
    detail.root.addEventListener('animationstart',event=>{if(['sc-detail-reveal','sc-preview-reveal'].includes(event.animationName))detailResult.starts.push(eventName(event));});
    detail.root.addEventListener('animationend',event=>{if(['sc-detail-reveal','sc-preview-reveal'].includes(event.animationName))detailResult.ends.push(eventName(event));});
    detail.root.scrollIntoView({block:'start'});await settle();detailResult.initial=revealState(preview());detailResult.initialStarts=detailResult.starts.length;
    detail.root.querySelector('[data-sc-role=dev] > summary').focus();await settle();detailResult.manual=revealState(preview());detailResult.manualFocus=document.activeElement===detail.root.querySelector('[data-sc-role=dev] > summary');
    const parentAnimation=revealAnimations(preview())[0];if(parentAnimation){parentAnimation.pause();await parentAnimation.ready;}
    skills()[0].querySelector('summary').click();await settle();detailResult.child=revealState(skills()[0]);
    await Promise.all(revealAnimations(skills()[0]).map(animation=>animation.finished));await settle();detailResult.childEndKeepsParent=body().classList.contains('is-detail-revealing')===!reduced;
    if(parentAnimation&&body().classList.contains('is-detail-revealing')){parentAnimation.play();await parentAnimation.finished;}await settle();detailResult.afterEnd=revealState(preview());detailResult.firstStarts=[...detailResult.starts];detailResult.firstEnds=[...detailResult.ends];
    skills()[0].querySelector('summary').focus();await nativeKey('Enter');await settle();detailResult.enterClosed=!skills()[0].open&&revealState(preview()).marked===0;
    await nativeKey('Space');await settle();detailResult.keyboard=revealState(preview());detailResult.keyboardFocus=document.activeElement===skills()[0].querySelector('summary');detailResult.spaceOpened=skills()[0].open;
    await Promise.all(revealAnimations(preview()).map(animation=>animation.finished));await settle();
    skills()[1].querySelector('summary').click();await settle();detailResult.secondChild=revealState(skills()[1]);detailResult.independentSkills=skills().every(node=>node.open);await Promise.all(revealAnimations(preview()).map(animation=>animation.finished));await settle();
    skills()[0].querySelector('summary').focus();const oldBody=body();render(detail.root,detail.value);await settle();detailResult.refresh={...revealState(preview()),oldClean:!oldBody.classList.contains('is-detail-revealing'),open:skills()[0].open,focus:document.activeElement===skills()[0].querySelector('summary')};
    detail.root.querySelector('[data-sc-role=req] > summary').focus();await settle();detail.root.querySelector('[data-sc-role=cr] > summary').focus();await settle();detailResult.switch={...revealState(preview()),role:detail.root.querySelector('[data-sc-preview-link]:not([hidden])').closest('[data-sc-role]').dataset.scRole.toUpperCase()};await Promise.all(revealAnimations(preview()).map(animation=>animation.finished));await settle();
    skills()[0].querySelector('summary').focus();await nativeKey('Enter');await settle();await Promise.all(revealAnimations(preview()).map(animation=>animation.finished));await settle();await nativeKey('Enter');detailResult.closeImmediate=!skills()[0].open;await settle();detailResult.closed=revealState(preview());const closedBody=skills()[0].querySelector(':scope > [data-sc-detail-body]');detailResult.closedHidden=!closedBody.checkVisibility();detailResult.closedAnimation=getComputedStyle(closedBody).animationName;
    const coexist=fresh();coexist.value.role_details.cr.subskills=[{name:'review-with-goal',summary:'交接审查'}];render(coexist.root,coexist.value);coexist.value.handoffs.push(handoff('detail-coexist'));render(coexist.root,coexist.value);coexist.root.scrollIntoView({block:'start'});coexist.root.querySelector('[data-sc-preview-subskill] > summary').click();await settle();detailResult.coexist={...revealState(coexist.root.querySelector('[data-sc-role-preview]')),handoff:inspect(coexist.root)};
    detailResult.sourceHidden=!detail.root.querySelector('[data-sc-role=cr] > [data-sc-detail-body]').checkVisibility();
  } else {
  detail.root.addEventListener('animationstart',event=>{if(event.animationName==='sc-detail-reveal')detailResult.starts.push(event.target.closest('[data-sc-subskill]')?.dataset.scSubskill||event.target.closest('[data-sc-role]')?.dataset.scRole);});
  detail.root.addEventListener('animationend',event=>{if(event.animationName==='sc-detail-reveal')detailResult.ends.push(event.target.closest('[data-sc-subskill]')?.dataset.scSubskill||event.target.closest('[data-sc-role]')?.dataset.scRole);});
  detail.root.scrollIntoView({block:'start'});await settle();detailResult.initial=revealState(detail.root);detailResult.initialStarts=detailResult.starts.length;
  const role=()=>detail.root.querySelector('[data-sc-role=dev]'),summary=()=>role().querySelector(':scope > summary'),skills=()=>[...role().querySelectorAll('[data-sc-subskill]')];
  const finishReveal=async()=>{await Promise.all(revealAnimations(detail.root).map(animation=>animation.finished));await settle();};
  summary().focus();summary().click();await settle();detailResult.manual=revealState(detail.root);detailResult.manualStarts=detailResult.starts.length;detailResult.manualFocus=document.activeElement===summary();
  const parentAnimation=revealAnimations(detail.root)[0];if(parentAnimation){parentAnimation.pause();await parentAnimation.ready;}
  skills()[0].querySelector('summary').click();await settle();detailResult.child=revealState(skills()[0]);
  await Promise.all(revealAnimations(skills()[0]).map(animation=>animation.finished));await settle();
  detailResult.childEndKeepsParent=revealState(role()).marked===(reduced?0:1);
  if(parentAnimation&&role().querySelector(':scope > [data-sc-detail-body]').classList.contains('is-detail-revealing')){parentAnimation.play();await parentAnimation.finished;}await settle();
  detailResult.afterEnd=revealState(detail.root);detailResult.firstStarts=[...detailResult.starts];detailResult.firstEnds=[...detailResult.ends];
  summary().focus();await nativeKey('Enter');await settle();detailResult.enterClosed=!role().open&&revealState(detail.root).marked===0;if(role().open)throw new Error('Native Enter did not close the focused DEV summary');
  await nativeKey('Space');await settle();detailResult.keyboard=revealState(detail.root);detailResult.keyboardFocus=document.activeElement===summary();detailResult.spaceOpened=role().open;if(!role().open)throw new Error('Native Space did not open the focused DEV summary');await finishReveal();
  skills()[1].querySelector('summary').click();await settle();detailResult.secondChild=revealState(skills()[1]);detailResult.independentSkills=skills().every(node=>node.open);await finishReveal();
  summary().click();await settle();summary().click();await settle();const oldBody=role().querySelector(':scope > [data-sc-detail-body]');summary().focus();render(detail.root,detail.value);await settle();
  detailResult.refresh={...revealState(detail.root),oldClean:!oldBody.classList.contains('is-detail-revealing'),open:role().open,focus:document.activeElement===summary()};
  detail.root.querySelector('[data-sc-role=req] > summary').click();await settle();detail.root.querySelector('[data-sc-role=cr] > summary').click();await settle();
  detailResult.switch={...revealState(detail.root),open:[...detail.root.querySelectorAll('[data-sc-role][open]')].map(node=>node.dataset.scRole)};
  detail.root.querySelector('[data-sc-role=cr] > summary').click();detailResult.closeImmediate=!detail.root.querySelector('[data-sc-role=cr]').open;await settle();detailResult.closed=revealState(detail.root);
  const closedBody=detail.root.querySelector('[data-sc-role=cr] > [data-sc-detail-body]');detailResult.closedHidden=!closedBody.checkVisibility();detailResult.closedAnimation=getComputedStyle(closedBody).animationName;
  const coexist=fresh();coexist.value.handoffs.push(handoff('detail-coexist'));render(coexist.root,coexist.value);coexist.root.scrollIntoView({block:'start'});
  coexist.root.querySelector('[data-sc-role=cr] > summary').click();await settle();coexist.root.querySelector('[data-sc-role=cr] > summary').click();await settle();detailResult.coexist={...revealState(coexist.root),handoff:inspect(coexist.root)};
  detailResult.hiddenPreview={visible:detail.root.querySelector('[data-sc-role-preview]').checkVisibility({visibilityProperty:true}),marked:detail.root.querySelectorAll('[data-sc-role-preview] .is-detail-revealing').length,animations:revealAnimations(detail.root.querySelector('[data-sc-role-preview]')).length};
  }
  results.reduced=reduced;parent.postMessage({scHandoffResult:results},'*');
})().catch(error=>{document.body.dataset.scTestError=error.stack;parent.postMessage({scHandoffError:error.stack},'*');});
</script></body></html>`;

async function readResult(width, reduced) {
  const srcdoc = harness.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const wrapper = `<!doctype html><html><body><script>window.addEventListener('message',event=>{if(event.source===document.querySelector('iframe').contentWindow){if(event.data.scHandoffResult)document.body.dataset.scTestResult=JSON.stringify(event.data.scHandoffResult);if(event.data.scHandoffError)document.body.dataset.scTestError=event.data.scHandoffError;if(event.data.scInputKey)document.body.dataset.scTestInput=JSON.stringify(event.data.scInputKey);}});</script><iframe style="border:0;width:${width}px;height:900px" srcdoc="${srcdoc}"></iframe></body></html>`;
  fs.writeFileSync(page, wrapper, "utf8");
  // Real CSS animation events need compositor time; only control this test's isolated Chrome over inherited pipes.
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--remote-debugging-pipe", `--user-data-dir=${path.join(temp, `profile-${width}-${reduced}`)}`, "--window-size=1000,1000"];
  if (reduced) args.push("--force-prefers-reduced-motion");
  const child = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });
  ownedChrome.add(child);
  const pending = new Map();
  let sequence = 0, buffer = "", exited = false, processClosed = false, terminalError, stderr = "", resolveClosed;
  const fail = error => { terminalError ||= error; for (const request of pending.values()) { clearTimeout(request.timer); request.reject(terminalError); } pending.clear(); };
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  child.once("exit", (code, signal) => { exited = true; fail(new Error(`Isolated Chrome exited (${code ?? signal}): ${stderr}`)); });
  child.once("close", (code, signal) => { processClosed = true; ownedChrome.delete(child); fail(new Error(`Isolated Chrome closed (${code ?? signal}): ${stderr}`)); resolveClosed(); });
  child.on("error", fail);
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-2000); });
  child.stdio[3].on("error", fail);
  child.stdio[4].on("error", fail);
  child.stdio[4].on("data", chunk => {
    buffer += chunk.toString("utf8");
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const frame = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!frame) continue;
      let message;
      try { message = JSON.parse(frame); } catch (error) { fail(error); continue; }
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (terminalError) return reject(terminalError);
    const id = ++sequence;
    const timer = setTimeout(() => fail(new Error(`${method} timed out`)), 10000);
    pending.set(id, { resolve, reject, timer });
    try { child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0", error => { if (error) fail(error); }); } catch (error) { fail(error); }
  });
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Target.activateTarget", { targetId });
    await send("Page.enable", {}, sessionId);
    await send("Page.navigate", { url: new URL(`file:///${page.replaceAll("\\", "/")}`).href }, sessionId);
    const deadline = Date.now() + 15000;let lastInput=0;
    while (Date.now() < deadline) {
      let value;
      try {
        const observation = await send("Runtime.evaluate", { expression: "document.body&&({result:document.body.dataset.scTestResult,error:document.body.dataset.scTestError,input:document.body.dataset.scTestInput})", returnByValue: true }, sessionId);
        if (observation.exceptionDetails) throw new Error(observation.exceptionDetails.text);
        value = observation.result.value;
      } catch (error) {
        if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
      }
      assert.ok(!value?.error, `Handoff behavior harness failed: ${value?.error}`);
      if (value?.result) return JSON.parse(value.result);
      const input=value?.input&&JSON.parse(value.input);
      if(input&&input.id!==lastInput){
        assert.ok(Number.isSafeInteger(input.id)&&input.id>lastInput&&['Enter','Space'].includes(input.key),'keyboard bridge accepts only ordered native Enter/Space requests from this fixture');lastInput=input.id;
        const key=input.key==='Enter'?{key:'Enter',code:'Enter',windowsVirtualKeyCode:13}:{key:' ',code:'Space',windowsVirtualKeyCode:32};
        const text=input.key==='Enter'?'\r':' ';
        await send('Input.dispatchKeyEvent',{type:'keyDown',...key,text,unmodifiedText:text},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',...key},sessionId);
        await send('Runtime.evaluate',{expression:"document.querySelector('iframe').contentWindow.postMessage({scInputDone:"+input.id+"},'*')"},sessionId);
      }
      await delay(20);
    }
    const diagnostic=await send('Runtime.evaluate',{expression:"JSON.stringify({input:document.body.dataset.scTestInput,focus:document.querySelector('iframe').contentDocument.activeElement?.outerHTML,animations:document.querySelector('iframe').contentDocument.getAnimations().filter(a=>a.animationName==='sc-detail-reveal').map(a=>({state:a.playState,time:a.currentTime,role:a.effect.target.closest('[data-sc-role]')?.dataset.scRole,skill:a.effect.target.closest('[data-sc-subskill]')?.dataset.scSubskill}))})",returnByValue:true},sessionId);
    throw new Error("Chrome did not emit the handoff behavior result within 15 seconds: "+diagnostic.result.value);
  } finally {
    if (!processClosed && !terminalError) await send("Browser.close").catch(() => {});
    await Promise.race([closed, delay(1500)]);
    if (!processClosed && !exited) { try { child.kill(); } catch (error) { fail(error); } }
    fail(new Error("Isolated Chrome session closed"));
    child.stdio[3].destroy(); child.stdio[4].destroy();
    await Promise.race([closed, delay(1500)]);
    assert.ok(processClosed, `Isolated Chrome did not close; retained temporary files: ${temp}`);
  }
}

const quiet = { flows: 0, receivers: [], reverse: 0 };
function assertQuiet(value, name) { assert.deepEqual(value, quiet, `${name} must stay static and must not replay history`); }
function assertFlow(value, receiver, reverse, name) {
  assert.equal(value.flows, 1, `${name} must animate exactly one existing adjacent connector`);
  assert.deepEqual(value.receivers, [receiver], `${name} must highlight only the receiver`);
  assert.equal(value.reverse, reverse ? 1 : 0, `${name} must use the accepted handoff direction`);
}

(async () => { try {
  for (const mode of [{ width: 360, reduced: false }, { width: 960, reduced: false }, { width: 360, reduced: true }]) {
    const result = await readResult(mode.width, mode.reduced);
    assert.equal(result.reduced, mode.reduced, "the browser must use the intended reduced-motion preference");
    for (const field of ["initial", "repeated", "activeOnly", "secondRoot", "refreshed", "newTask", "returnTask", "legacy", "transitionRepeated", "interrupted", "interruptResume", "preferenceSuppressed", "preferenceResumed", "afterCleanup", "afterCleanupUpdate", "afterCancel"]) assertQuiet(result[field], field);
    for (const group of ["invalid", "stops", "resumes"]) for (const [name, value] of Object.entries(result[group])) assertQuiet(value, `${group}.${name}`);
    assert.equal(result.unchanged, true, "handoff rendering must not mutate the authoritative snapshot");
    assert.equal(result.legacyRoles, 4, "legacy snapshots without handoff identity must retain all role cards");
    assert.deepEqual(result.focus, { open: ["req"], role: "req" }, "handoff feedback must preserve the same-task manual accordion selection and keyboard focus");
    assert.equal(result.layout.viewport, mode.width, "layout must run at the exact requested iframe viewport");
    assert.ok(result.layout.scrollWidth <= mode.width, "handoff feedback must not overflow narrow or wide task views");
    assert.equal(result.layout.roleCount, 4, "handoff feedback must not insert synthetic role cards");
    const detail=result.detail,staticReveal={marked:0,animations:[]};
    assert.deepEqual(detail.initial,staticReveal,'initially open role and queued native toggles must stay static');assert.equal(detail.initialStarts,0);
    for(const field of ['manualFocus','childEndKeepsParent','enterClosed','keyboardFocus','spaceOpened','independentSkills','closeImmediate','closedHidden'])assert.equal(detail[field],true,field+' must retain native detail semantics '+JSON.stringify({mode,detail}));
    assert.equal(detail.closedAnimation,'none','closed detail bodies must have no computed CSS animation');
    assert.deepEqual(detail.afterEnd,staticReveal,'finite detail motion must clear after actual CSS animationend');assert.deepEqual(detail.closed,staticReveal,'closing details must immediately clear transient motion');
    assert.deepEqual(detail.refresh,{...staticReveal,oldClean:true,open:true,focus:true},'same-task refresh must remove old motion, keep manual role selection and focus, and remain static');
    if(mode.width>560){assert.equal(detail.switch.role,'CR','desktop focus switching must update the independent preview');assert.equal(detail.sourceHidden,true,'desktop source detail bodies must remain hidden');}
    else {assert.deepEqual(detail.switch.open,['cr'],'rapid role switching must preserve one-open accordion semantics');assert.deepEqual(detail.hiddenPreview,{visible:false,marked:0,animations:0},'hidden narrow preview must not retain transient reveal markers or animations');}
    for(const field of ['manual','child','keyboard','secondChild','switch','coexist']){
      assert.equal(detail[field].marked,mode.reduced?0:1,field+' must animate only one opened detail body');
      assert.equal(detail[field].animations.length,mode.reduced?0:1,field+' must create exactly one finite detail animation');
      for(const animation of detail[field].animations){assert.ok(animation.duration>=140&&animation.duration<=200,field+' must use the approved 140–200 ms duration');assert.equal(animation.iterations,1);const preview=mode.width>560&&['manual','switch'].includes(field);assert.equal(animation.name,preview?'sc-preview-reveal':'sc-detail-reveal',field+' must use its dedicated reveal animation');if(preview)assert.equal(animation.transform,'none','shared preview reveal must not translate its body');}
    }
    if(!mode.reduced){assert.deepEqual(detail.firstStarts.sort(),['dev','tech-select'],'manual role and child openings must each start only once');assert.deepEqual(detail.firstEnds.sort(),['dev','tech-select'],'child completion must not consume the parent completion listener');assertFlow(detail.coexist.handoff,'cr',false,'detail/handoff coexistence');assert.equal(detail.coexist.handoff.activeAnimation,'sc-running-pulse','detail reveal must preserve the running pulse');}
    else {assert.deepEqual(detail.starts,[],'reduced motion must not create detail animationstart events');assert.deepEqual(detail.ends,[]);assertQuiet({flows:detail.coexist.handoff.flows,receivers:detail.coexist.handoff.receivers,reverse:detail.coexist.handoff.reverse},'reduced detail/handoff coexistence');}
    if (mode.reduced) {
      for (const field of ["forward", "reverse", "qaForward", "beforeCleanup"]) assertQuiet({ flows: result[field].flows, receivers: result[field].receivers, reverse: result[field].reverse }, field);
      assertQuiet(result.acceptedTransition, "acceptedTransition");
      assertQuiet(result.optionalUnit, "optionalUnit");
      assertQuiet(result.nextEvent, "nextEvent");
      assert.deepEqual(result.endEvents, [], "reduced motion must not create finite animation completion events");
      assert.deepEqual(result.cancelEvents, [], "reduced motion must not create finite animation cancellation events");
      continue;
    }
    assertFlow(result.forward, "cr", false, "forward");
    assertFlow(result.qaForward, "qa", false, "CR passed before QA handoff");
    assertFlow(result.reverse, "dev", true, "reverse");
    assertFlow(result.acceptedTransition, "cr", false, "pending-to-accepted");
    assertFlow(result.optionalUnit, "cr", false, "an omitted optional work-unit identity");
    assertFlow(result.nextEvent, "cr", false, "the next unique handoff");
    assertFlow(result.beforeCancel, "dev", true, "the cancellable reverse handoff");
    const expectedEvents = ["sc-handoff-flow/::before", "sc-handoff-receive/::after"];
    assert.deepEqual(result.endEvents.sort(), expectedEvents, "Chrome must dispatch actual CSS animationend events for both finite effects");
    assert.deepEqual(result.cancelEvents.sort(), expectedEvents, "Chrome must dispatch actual CSS animationcancel events for both finite effects");
    assert.equal(result.cancelClock.length, 2, "both cancellable CSS effects must have started");
    assert.ok(result.cancelClock.every(clock => Number.isFinite(clock.start) && clock.time > 0), "CSS effects must be ready and time must advance before cancellation");
    for (const item of [result.forward, result.reverse]) {
      assert.equal(item.flowAnimation, "sc-handoff-flow");
      assert.equal(item.flowIterations, "1", "handoff flow must finish after one pass");
      assert.equal(item.receiveAnimation, "sc-handoff-receive");
      assert.equal(item.receiveIterations, "1", "receiver feedback must finish after one pass");
      assert.equal(item.receivePointerEvents, "none", "feedback must not block role interaction");
      assert.equal(item.hidden, "true", "decorative flow must remain hidden from assistive technology");
      assert.equal(item.activeAnimation, "sc-running-pulse", "receiver feedback must preserve the existing active-role pulse");
      assert.ok(parseFloat(item.flowDuration) > 0 && parseFloat(item.flowDuration) <= 1, "connector travel must have a short finite duration");
      assert.ok(parseFloat(item.receiveDelay) >= parseFloat(item.flowDuration), "receiver feedback must follow connector travel");
      assert.ok(parseFloat(item.receiveDuration) > 0 && parseFloat(item.receiveDuration) <= 1, "receiver feedback must have a short finite duration");
    }
    assert.equal(result.forward.flowDirection, "normal");
    assert.equal(result.reverse.flowDirection, "reverse");
    for(const item of [result.forward,result.reverse]){assert.equal(item.headTransform,'matrix(1, 0, 0, 1, -4, 0)');assert.equal(item.headLeft,'4px');assert.equal(item.headRight,'4px');assert.equal(item.headLeftColor,'rgba(0, 0, 0, 0)');assert.equal(item.headRightColor,'rgba(0, 0, 0, 0)');}
    assert.equal(result.forward.headTop,'7px');assert.equal(result.forward.headBottom,'0px');assert.equal(result.forward.headTopColor,result.forward.color,'forward solid triangle must point down');
    assert.equal(result.reverse.headTop,'0px');assert.equal(result.reverse.headBottom,'7px');assert.equal(result.reverse.headBottomColor,result.reverse.color,'reverse solid triangle must point up');
  }
  console.log("SC handoff motion independent Chrome regression passed (360px, 960px, reduced motion).");
} finally {
  assert.equal(ownedChrome.size, 0, `Isolated Chrome is still open; retained temporary files: ${temp}`);
  fs.rmSync(temp, { recursive: true, force: true });
} })().catch(error => { console.error(error); process.exitCode = 1; });
