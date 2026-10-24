"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
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
// Observe the real native lifecycle; keep geometry and browser delivery unmocked.
const instrumentedTemplate = template.replace("<script>", `<script>
window.qaReturnObservers=[];
const QaNativeResizeObserver=window.ResizeObserver;
window.ResizeObserver=class extends QaNativeResizeObserver {
  constructor(callback){const record={targets:[],callbacks:0,disconnected:false};super((entries,observer)=>{record.callbacks++;callback(entries,observer);});this.qaRecord=record;window.qaReturnObservers.push(record);}
  observe(target,options){this.qaRecord.targets.push(target);super.observe(target,options);}
  disconnect(){this.qaRecord.disconnected=true;super.disconnect();}
};`);
const harness = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="seed">${instrumentedTemplate}</main><script>
window.onerror=(message,source,line,column)=>document.body.dataset.scTestError=String(message)+' at '+line+':'+column;
const seed=document.getElementById('seed'),pristine=seed.cloneNode(true),results={};
let sequence=0;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const makeRoot=()=>{const root=pristine.cloneNode(true);root.id='case-'+(++sequence);document.body.append(root);return root;};
const snapshot=(id='task')=>({view_id:'sc-task-view:'+id,state:'ready_for_cr',work_unit:{work_unit_id:id,roles:['req','dev','cr','qa']},role_details:{req:{status:'passed'},dev:{status:'passed'},cr:{status:'running'},qa:{status:'pending'}},handoffs:[]});
const handoff=(id,from='dev',to='cr',unit='task')=>({handoff_id:id,from,to,work_unit_id:unit,handoff_result:'accepted'});
const render=(root,value)=>window.renderSurveyCorpsTaskView(root,value);
const marked=root=>({flows:root.querySelectorAll('.is-handoff-flow,.is-handoff-return-flow').length,receivers:[...root.querySelectorAll('.is-handoff-receiving')].map(node=>node.dataset.scRole),reverse:root.querySelectorAll('.sc-task-view__handoff-return').length});
const observerState=root=>{const lane=root.querySelector('.sc-task-view__role-lane'),records=window.qaReturnObservers.filter(record=>record.targets.includes(lane));return {created:records.length,live:records.filter(record=>!record.disconnected).length,callbacks:records.reduce((sum,record)=>sum+record.callbacks,0),targetCounts:records.map(record=>record.targets.length)};};
const returnGeometry=root=>{const svg=root.querySelector('.sc-task-view__handoff-return');if(!svg)return null;const path=svg.querySelector('.sc-task-view__handoff-return-line'),tip=svg.querySelector('.sc-task-view__handoff-return-tip'),source=root.querySelector('[data-sc-role=cr]').getBoundingClientRect(),target=root.querySelector('[data-sc-role=dev]').getBoundingClientRect(),bounds=path.getBBox(),point=(line,distance)=>{const p=line.getPointAtLength(distance).matrixTransform(line.getScreenCTM());return [p.x,p.y];};return {source:[source.left+source.width/2+12,source.top],target:[target.left+target.width/2+12,target.bottom],start:point(path,0),end:point(path,path.getTotalLength()),tip:point(tip,tip.getTotalLength()/2),outside:new DOMPoint(bounds.x+bounds.width,0).matrixTransform(path.getScreenCTM()).x,expectedOutside:Math.max(source.left+source.width/2,target.left+target.width/2)+26,path:path.getAttribute('d'),lane:svg.getAttribute('viewBox')};};
const inspect=root=>{const connector=root.querySelector('.is-handoff-flow'),svg=root.querySelector('.sc-task-view__handoff-return'),light=svg?.querySelector('.sc-task-view__handoff-return-light'),line=svg?.querySelector('.sc-task-view__handoff-return-line'),receiver=root.querySelector('.is-handoff-receiving');const flow=light?getComputedStyle(light):connector&&getComputedStyle(connector,'::before'),head=connector&&getComputedStyle(connector,'::after'),receive=receiver&&getComputedStyle(receiver,'::after'),pathStyle=line&&getComputedStyle(line);return {...marked(root),from:svg?'cr':connector?.dataset.scConnectorFrom,to:svg?'dev':connector?.dataset.scConnectorTo,hidden:(svg||connector)?.getAttribute('aria-hidden'),flowAnimation:flow?.animationName,flowDuration:flow?.animationDuration,flowIterations:flow?.animationIterationCount,flowDirection:flow?.animationDirection,headTransform:head?.transform,headTop:head?.borderTopWidth,headBottom:head?.borderBottomWidth,headLeft:head?.borderLeftWidth,headRight:head?.borderRightWidth,headTopColor:head?.borderTopColor,headBottomColor:head?.borderBottomColor,headLeftColor:head?.borderLeftColor,headRightColor:head?.borderRightColor,color:(svg||connector)&&getComputedStyle(svg||connector).color,receiveAnimation:receive?.animationName,receiveDuration:receive?.animationDuration,receiveDelay:receive?.animationDelay,receiveIterations:receive?.animationIterationCount,receivePointerEvents:receive?.pointerEvents,activeAnimation:receiver&&getComputedStyle(receiver).animationName,geometry:returnGeometry(root),pathWidth:pathStyle?.strokeWidth,pathCap:pathStyle?.strokeLinecap,pathJoin:pathStyle?.strokeLinejoin,lineDash:pathStyle?.strokeDasharray,lightDash:light&&getComputedStyle(light).strokeDasharray,pathLength:light?.getAttribute('pathLength'),pointerEvents:svg&&getComputedStyle(svg).pointerEvents,focusable:svg?.getAttribute('focusable')};};
const fresh=()=>{const root=makeRoot(),value=snapshot();render(root,value);return {root,value};};
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const settle=async()=>{await wait(0);await new Promise(requestAnimationFrame);await wait(0);};
const revealAnimations=root=>root.getAnimations({subtree:true}).filter(animation=>['sc-detail-reveal','sc-preview-reveal'].includes(animation.animationName)&&animation.effect.target.checkVisibility()&&getComputedStyle(animation.effect.target).animationName===animation.animationName);
const revealState=root=>({marked:root.querySelectorAll('.is-detail-revealing').length,animations:revealAnimations(root).map(animation=>({name:animation.animationName,transform:getComputedStyle(animation.effect.target).transform,duration:animation.effect.getTiming().duration,iterations:animation.effect.getTiming().iterations,role:animation.effect.target.closest('[data-sc-role]')?.dataset.scRole||null}))});
let keySequence=0,motionSequence=0;
const nativeMotion=reduce=>new Promise(resolve=>{const id=++motionSequence,done=event=>{if(event.source!==parent||event.data.scMotionDone!==id)return;window.removeEventListener('message',done);resolve();};window.addEventListener('message',done);parent.postMessage({scMotionPreference:{id,reduce}},'*');});
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
  const finiteAnimations=root=>root.getAnimations({subtree:true}).filter(animation=>['sc-handoff-flow','sc-handoff-return','sc-handoff-receive'].includes(animation.animationName));
  const cleanup=fresh();results.endEvents=[];const onHandoffEnd=event=>results.endEvents.push(event.animationName+'/'+event.pseudoElement);cleanup.root.addEventListener('animationend',onHandoffEnd);
  cleanup.value.handoffs.push(handoff('cleanup'));render(cleanup.root,cleanup.value);results.beforeCleanup=inspect(cleanup.root);
  cleanup.root.scrollIntoView({block:'start'});
  const ending=finiteAnimations(cleanup.root);await Promise.all(ending.map(animation=>animation.finished));await new Promise(requestAnimationFrame);await wait(0);
  results.afterCleanup=marked(cleanup.root);cleanup.root.removeEventListener('animationend',onHandoffEnd);render(cleanup.root,cleanup.value);results.afterCleanupUpdate=marked(cleanup.root);
  const again=structuredClone(cleanup.value);again.handoffs.push(handoff('next'));render(cleanup.root,again);results.nextEvent=marked(cleanup.root);
  const cancel=fresh();results.cancelEvents=[];const onHandoffCancel=event=>results.cancelEvents.push(event.animationName+'/'+event.pseudoElement);cancel.root.addEventListener('animationcancel',onHandoffCancel);
  cancel.value.role_details.cr.status='passed';cancel.value.role_details.dev.status='running';cancel.value.handoffs.push(handoff('cancel','cr','dev'));render(cancel.root,cancel.value);results.beforeCancel=inspect(cancel.root);
  cancel.root.scrollIntoView({block:'start'});const cancelling=finiteAnimations(cancel.root);await Promise.all(cancelling.map(animation=>animation.ready));await wait(100);
  results.cancelClock=cancelling.map(animation=>({start:animation.startTime,time:animation.currentTime}));
  const stopStyle=document.createElement('style');stopStyle.textContent='#'+cancel.root.id+' .is-handoff-flow::before,#'+cancel.root.id+' .is-handoff-return-flow,#'+cancel.root.id+' .is-handoff-receiving::after{animation-name:none}';cancel.root.append(stopStyle);void cancel.root.offsetWidth;
  await new Promise(requestAnimationFrame);await wait(0);results.afterCancel=marked(cancel.root);results.cancelObservers=observerState(cancel.root);cancel.root.removeEventListener('animationcancel',onHandoffCancel);
  // QA sc-view-return-motion: measure physical endpoints, native ResizeObserver and actual compositor lifecycle.
  const frames=async()=>{await settle();await settle();};
  const finishFinite=async root=>{await Promise.all(finiteAnimations(root).map(animation=>animation.finished));await frames();};
  const activate=(sample,role)=>{sample.value.state=role==='dev'?'dev_in_progress':role==='qa'?'ready_for_qa':'ready_for_cr';sample.value.role_details.dev.status='passed';sample.value.role_details.cr.status='passed';sample.value.role_details.qa.status='pending';sample.value.role_details[role].status='running';};
  const returnSample=name=>{const sample=fresh();sample.value.role_details.dev.summary='Inline details with enough content to change the receiving card height. '.repeat(5);activate(sample,'dev');sample.value.handoffs.push(handoff(name,'cr','dev'));render(sample.root,sample.value);return sample;};
  const stableLayout=root=>{const rect=node=>{const box=node.getBoundingClientRect();return [box.x,box.y,box.width,box.height];};return {view:rect(root),cards:[...root.querySelectorAll('details[data-sc-role]')].map(rect),preview:rect(root.querySelector('[data-sc-role-preview]'))};};
  const sized=returnSample('dynamic-return'),sizedCard=sized.root.querySelector('[data-sc-role=dev]'),sizedSvg=sized.root.querySelector('.sc-task-view__handoff-return'),sizedBefore=JSON.stringify(sized.value);sized.root.scrollIntoView({block:'start'});results.returnEndEvents=[];sized.root.addEventListener('animationend',event=>{if(['sc-handoff-return','sc-handoff-receive'].includes(event.animationName))results.returnEndEvents.push(event.animationName+'/'+event.pseudoElement);});
  const initialGeometry=returnGeometry(sized.root);sizedCard.open=false;await frames();const closedGeometry=returnGeometry(sized.root);sizedCard.open=true;await frames();const reopenedGeometry=returnGeometry(sized.root),beforeResize=observerState(sized.root);sizedCard.querySelector('summary').style.minHeight=(sizedCard.querySelector('summary').getBoundingClientRect().height+44)+'px';await frames();
  results.dynamicReturn={initial:initialGeometry,closed:closedGeometry,reopened:reopenedGeometry,resized:returnGeometry(sized.root),beforeResize,afterResize:observerState(sized.root),sameSvg:sized.root.querySelector('.sc-task-view__handoff-return')===sizedSvg,unchanged:sizedBefore===JSON.stringify(sized.value)};
  const light=sized.root.querySelector('.is-handoff-return-flow'),sweep=light?.getAnimations().find(animation=>animation.animationName==='sc-handoff-return');results.returnSweep=null;
  if(sweep){await sweep.ready;const current=sweep.currentTime,timing=sweep.effect.getTiming();sweep.pause();const offsets=[];for(const time of [0,325,640]){sweep.currentTime=time;offsets.push(parseFloat(getComputedStyle(light).strokeDashoffset));}results.returnSweep={duration:timing.duration,iterations:timing.iterations,offsets};sweep.currentTime=current;sweep.play();}
  const layoutBefore=stableLayout(sized.root);sizedCard.querySelector('summary').focus();await settle();sized.root.querySelector('[data-sc-role=cr] > summary').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));await settle();results.returnInteraction={sameLayout:JSON.stringify(layoutBefore)===JSON.stringify(stableLayout(sized.root)),focus:sized.root.querySelector('[data-sc-role=dev] > summary')===document.activeElement,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  await finishFinite(sized.root);results.afterReturnEnd={...marked(sized.root),observers:observerState(sized.root)};
  results.returnLifecycle=[];
  for(const action of ['same-id','pause','task-switch','reduce']){
    const sample=returnSample('lifecycle-'+action);sample.root.scrollIntoView({block:'start'});await settle();const before=inspect(sample.root),observerBefore=observerState(sample.root);let mediaChanged=false;
    if(action==='pause'){sample.value.state='paused';render(sample.root,sample.value);sample.value.state='dev_in_progress';render(sample.root,sample.value);}
    else if(action==='task-switch'){render(sample.root,snapshot('switched'));render(sample.root,sample.value);}
    else if(action==='reduce'&&!reduced){await nativeMotion(true);await frames();mediaChanged=matchMedia('(prefers-reduced-motion:reduce)').matches;await nativeMotion(false);}
    else render(sample.root,sample.value);
    await frames();const after=marked(sample.root),observers=observerState(sample.root),callbacks=observers.callbacks;sample.root.querySelector('[data-sc-role=dev] > summary').style.minHeight='220px';await frames();render(sample.root,sample.value);await frames();
    results.returnLifecycle.push({action,before,observerBefore,after,observers,callbacksStable:observerState(sample.root).callbacks===callbacks,noReplay:marked(sample.root),mediaChanged,preferenceRestored:matchMedia('(prefers-reduced-motion:reduce)').matches===reduced});
  }
  const rounds=fresh();rounds.root.scrollIntoView({block:'start'});results.rounds=[];
  for(const [id,from,to] of [['round-return-1','cr','dev'],['round-submit-1','dev','cr'],['round-return-2','cr','dev'],['round-submit-2','dev','cr'],['round-qa','cr','qa']]){
    activate(rounds,to);rounds.value.handoffs.push(handoff(id,from,to));const before=JSON.stringify(rounds.value);render(rounds.root,rounds.value);const during=inspect(rounds.root),observers=observerState(rounds.root);await finishFinite(rounds.root);const ended=marked(rounds.root);render(rounds.root,rounds.value);results.rounds.push({id,from,to,during,observers,ended,afterSameId:marked(rounds.root),afterObservers:observerState(rounds.root),unchanged:before===JSON.stringify(rounds.value),order:[...rounds.root.querySelectorAll('details[data-sc-role]')].map(node=>node.dataset.scRole)});
  }
  // Requirement source: approved detail opening transition; use native details toggles and real CSS events.
  const detail=fresh(),detailResult=results.detail={starts:[],ends:[]};
  const preview=()=>detail.root.querySelector('[data-sc-role-preview]'),body=()=>detail.root.querySelector('[data-sc-preview-body]'),role=()=>detail.root.querySelector('[data-sc-role=dev]'),summary=()=>role().querySelector(':scope > summary');
  const area=()=>innerWidth>560?preview():detail.root,finishReveal=async()=>{await Promise.all(revealAnimations(area()).map(animation=>animation.finished));await settle();};
  const eventRole=event=>event.target.closest('[data-sc-role]')?.dataset.scRole||detail.root.querySelector('[data-sc-preview-link]:not([hidden])')?.closest('[data-sc-role]').dataset.scRole;
  for(const [event,key] of [['animationstart','starts'],['animationend','ends']])detail.root.addEventListener(event,event=>{if(['sc-detail-reveal','sc-preview-reveal'].includes(event.animationName))detailResult[key].push(eventRole(event));});
  detail.root.scrollIntoView({block:'start'});await settle();detailResult.initial=revealState(area());detailResult.initialStarts=detailResult.starts.length;
  summary().focus();if(innerWidth<=560)summary().click();await settle();detailResult.manual=revealState(area());detailResult.manualFocus=document.activeElement===summary();await finishReveal();detailResult.afterEnd=revealState(area());detailResult.firstStarts=[...detailResult.starts];detailResult.firstEnds=[...detailResult.ends];
  if(innerWidth>560){await nativeKey('ArrowRight');await settle();detailResult.bodyFocused=document.activeElement===body();await nativeKey('ShiftTab');await settle();detailResult.shiftReturned=document.activeElement===summary();await nativeKey('ArrowRight');await nativeKey('Escape');await settle();detailResult.escapeReturned=document.activeElement===summary();}
  else{await nativeKey('Enter');await settle();detailResult.enterClosed=!role().open;await nativeKey('Space');await settle();detailResult.spaceOpened=role().open;detailResult.keyboard=revealState(area());await finishReveal();}
  summary().focus();const oldBody=innerWidth>560?body():role().querySelector(':scope > [data-sc-detail-body]');render(detail.root,detail.value);await settle();detailResult.refresh={...revealState(area()),oldClean:!oldBody.classList.contains('is-detail-revealing'),focus:document.activeElement===summary()};
  const req=detail.root.querySelector('[data-sc-role=req] > summary'),cr=detail.root.querySelector('[data-sc-role=cr] > summary');if(innerWidth>560){req.focus();await settle();cr.focus();}else{req.click();await settle();cr.click();}await settle();detailResult.switch=revealState(area());await finishReveal();
  if(innerWidth<=560){cr.click();detailResult.closeImmediate=!cr.closest('[data-sc-role]').open;await settle();detailResult.closed=revealState(area());detailResult.closedHidden=!detail.root.querySelector('[data-sc-role=cr] > [data-sc-detail-body]').checkVisibility();}
  const coexist=fresh();coexist.value.handoffs.push(handoff('detail-coexist'));render(coexist.root,coexist.value);coexist.root.scrollIntoView({block:'start'});await settle();const coexistSummary=coexist.root.querySelector('[data-sc-role=dev] > summary');if(innerWidth>560)coexistSummary.focus();else coexistSummary.click();await settle();detailResult.coexist={...revealState(innerWidth>560?coexist.root.querySelector('[data-sc-role-preview]'):coexist.root),handoff:inspect(coexist.root)};
  detailResult.removedControls=detail.root.querySelectorAll('[data-sc-role-preview] details,[data-sc-role] > [data-sc-detail-body] details,[data-sc-subskills],[data-sc-preview-subskill]').length;
  // QA role-subskill-shimmer, P1: measure the real compositor clock after both effects start.
  const shimmer=fresh();shimmer.value.role_details.cr.subskills=[{name:'review-with-goal',status:'passed',summary:'首条历史'},{name:'review-with-goal',status:'running',summary:'前轮执行'},{name:'review-with-goal',status:'running',summary:'本轮执行'},{name:'review-with-goal',status:'passed',summary:'末尾历史'}];render(shimmer.root,shimmer.value);shimmer.root.scrollIntoView({block:'start'});await settle();
  const shimmerNodes=()=>[shimmer.root.querySelector('[data-sc-role=cr] > summary .sc-task-view__role-state'),shimmer.root.querySelector('[data-sc-role=cr] > summary .sc-task-view__role-subskill.is-status-running')];
  const shimmerAnimation=node=>node.getAnimations().find(animation=>animation.animationName==='sc-status-shimmer');
  const readyShimmer=async()=>{await Promise.all(shimmerNodes().map(shimmerAnimation).filter(Boolean).map(animation=>animation.ready));await wait(80);await settle();};
  const shimmerClock=()=>shimmerNodes().map(node=>{const animation=shimmerAnimation(node),timing=animation?.effect.getTiming();return {name:getComputedStyle(node).animationName,marked:node.classList.contains('is-status-running'),duration:timing?.duration??null,easing:timing?.easing??null,delay:timing?.delay??null,iterations:timing?String(timing.iterations):null,rate:animation?.playbackRate??null,current:animation?.currentTime??null,start:animation?.startTime??null,state:animation?.playState??null,position:getComputedStyle(node).backgroundPosition};});
  await readyShimmer();const mounted=shimmerNodes().map(shimmerAnimation);results.shimmer={initial:shimmerClock(),identity:[],rows:[...shimmer.root.querySelectorAll('[data-sc-role=cr] > summary .sc-task-view__role-subskill')].map(node=>({name:node.textContent,marked:node.classList.contains('is-status-running'),animation:getComputedStyle(node).animationName,color:getComputedStyle(node).color}))};
  for(const action of ['hover','focus-away','focus-back']){const target=shimmer.root.querySelector('[data-sc-role='+(action==='focus-back'?'cr':'dev')+'] > summary');if(action==='hover')target.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));else target.focus();await settle();results.shimmer[action]=shimmerClock();results.shimmer.identity.push(shimmerNodes().every((node,index)=>shimmerAnimation(node)===mounted[index]));}
  render(shimmer.root,shimmer.value);await readyShimmer();results.shimmer.refresh=shimmerClock();
  results.reduced=reduced;parent.postMessage({scHandoffResult:results},'*');
})().catch(error=>{document.body.dataset.scTestError=error.stack;parent.postMessage({scHandoffError:error.stack},'*');});
</script></body></html>`;

// Compile the expanded browser scripts so template-only syntax errors fail before Chrome starts.
for (const [index, script] of [...harness.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new vm.Script(script[1], { filename: `sc-handoff-inline-${index}.js` });
}

async function readResult(width, reduced) {
  const srcdoc = harness.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const wrapper = `<!doctype html><html><body><script>window.addEventListener('message',event=>{if(event.source===document.querySelector('iframe').contentWindow){if(event.data.scHandoffResult)document.body.dataset.scTestResult=JSON.stringify(event.data.scHandoffResult);if(event.data.scHandoffError)document.body.dataset.scTestError=event.data.scHandoffError;if(event.data.scInputKey)document.body.dataset.scTestInput=JSON.stringify(event.data.scInputKey);if(event.data.scMotionPreference)document.body.dataset.scTestMotion=JSON.stringify(event.data.scMotionPreference);}});</script><iframe style="border:0;width:${width}px;height:900px" srcdoc="${srcdoc}"></iframe></body></html>`;
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
    const deadline = Date.now() + 25000;let lastInput=0,lastMotion=0;
    while (Date.now() < deadline) {
      let value;
      try {
        const observation = await send("Runtime.evaluate", { expression: "document.body&&({result:document.body.dataset.scTestResult,error:document.body.dataset.scTestError,input:document.body.dataset.scTestInput,motion:document.body.dataset.scTestMotion})", returnByValue: true }, sessionId);
        if (observation.exceptionDetails) throw new Error(observation.exceptionDetails.text);
        value = observation.result.value;
      } catch (error) {
        if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
      }
      assert.ok(!value?.error, `Handoff behavior harness failed: ${value?.error}`);
      if (value?.result) return JSON.parse(value.result);
      const input=value?.input&&JSON.parse(value.input);
      if(input&&input.id!==lastInput){
        assert.ok(Number.isSafeInteger(input.id)&&input.id>lastInput&&['Enter','Space','ArrowRight','ShiftTab','Escape'].includes(input.key),'keyboard bridge accepts only ordered fixture key requests');lastInput=input.id;
        const key={Enter:{key:'Enter',code:'Enter',windowsVirtualKeyCode:13},Space:{key:' ',code:'Space',windowsVirtualKeyCode:32},ArrowRight:{key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},ShiftTab:{key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8},Escape:{key:'Escape',code:'Escape',windowsVirtualKeyCode:27}}[input.key];
        const text=input.key==='Enter'?'\r':input.key==='Space'?' ':undefined;
        await send('Input.dispatchKeyEvent',{type:'keyDown',...key,text,unmodifiedText:text},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',...key},sessionId);
        await send('Runtime.evaluate',{expression:"document.querySelector('iframe').contentWindow.postMessage({scInputDone:"+input.id+"},'*')"},sessionId);
      }
      const motion=value?.motion&&JSON.parse(value.motion);
      if(motion&&motion.id!==lastMotion){
        assert.ok(Number.isSafeInteger(motion.id)&&motion.id>lastMotion&&typeof motion.reduce==="boolean","motion preference bridge accepts ordered boolean fixture requests");lastMotion=motion.id;
        await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:motion.reduce?"reduce":"no-preference"}]},sessionId);
        await send("Runtime.evaluate",{expression:"document.querySelector('iframe').contentWindow.postMessage({scMotionDone:"+motion.id+"},'*')"},sessionId);
      }
      await delay(20);
    }
    const diagnostic=await send('Runtime.evaluate',{expression:"JSON.stringify({input:document.body.dataset.scTestInput,focus:document.querySelector('iframe').contentDocument.activeElement?.outerHTML,animations:document.querySelector('iframe').contentDocument.getAnimations().filter(a=>a.animationName==='sc-detail-reveal').map(a=>({state:a.playState,time:a.currentTime,role:a.effect.target.closest('[data-sc-role]')?.dataset.scRole}))})",returnByValue:true},sessionId);
    throw new Error("Chrome did not emit the handoff behavior result within 25 seconds: "+diagnostic.result.value);
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

const motionOnly=value=>({flows:value.flows,receivers:value.receivers,reverse:value.reverse});
function assertReturnGeometry(value,name) {
  assert.ok(value,name+" provides browser-measured return geometry");
  for(const [actual,expected] of [[value.start,value.source],[value.end,value.target],[value.tip,value.target]])for(let index=0;index<2;index++)assert.ok(Math.abs(actual[index]-expected[index])<=1.1,name+" connects source top and receiver bottom at card center +12px");
  assert.ok(value.start[1]>value.end[1],name+" travels upward from source to receiver");
  assert.ok(Math.abs(value.outside-value.expectedOutside)<=1.1,name+" bends at card center +26px");
  assert.ok((value.path.match(/Q/g)||[]).length>=4,name+" has rounded turns");
  assert.ok(!/NaN|Infinity/.test(value.path));
}
function assertReturnStyle(value,name) {
  assertReturnGeometry(value.geometry,name);
  assert.equal(value.pathWidth,"2px");assert.equal(value.pathCap,"round");assert.equal(value.pathJoin,"round");
  const numbers=input=>input.split(/[, ]+/).filter(Boolean).map(parseFloat);
  assert.deepEqual(numbers(value.lineDash),[3,5]);assert.deepEqual(numbers(value.lightDash),[12,100]);
  assert.equal(value.pathLength,"100");assert.equal(value.pointerEvents,"none");assert.equal(value.focusable,"false");
  assert.equal(value.flowAnimation,"sc-handoff-return");assert.equal(value.flowDuration,"0.65s");assert.equal(value.flowIterations,"1");
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
    assert.deepEqual(result.shimmer.rows.map(row=>row.name),["review-with-goal"]);assert.deepEqual(result.shimmer.rows.map(row=>row.marked),[true],"the final eligible running record marks its one displayed name");for(const row of result.shimmer.rows){assert.equal(row.animation,mode.reduced?"none":"sc-status-shimmer");if(mode.reduced)assert.equal(row.color,"rgb(155, 168, 184)","reduced motion keeps the deduplicated skill static and muted");}
    assert.deepEqual(result.shimmer.identity,[true,true,true],"hover and keyboard preview changes retain both original animation objects");
    for(const phase of ["initial","hover","focus-away","focus-back","refresh"]){
      const pair=result.shimmer[phase];assert.equal(pair.length,2);
      for(const clock of pair){assert.equal(clock.marked,true);assert.equal(clock.name,mode.reduced?"none":"sc-status-shimmer");if(mode.reduced){assert.equal(clock.current,null);assert.equal(clock.start,null);continue;}assert.equal(clock.duration,1800);assert.equal(clock.easing,"linear");assert.equal(clock.delay,0);assert.equal(clock.iterations,"Infinity");assert.equal(clock.rate,1);assert.equal(clock.state,"running");assert.ok(Number.isFinite(clock.start)&&clock.current>0,phase+" samples a genuinely started animation");}
      if(!mode.reduced){assert.ok(Math.abs(pair[0].current-pair[1].current)<=1,phase+" keeps both shimmer clocks in phase");assert.ok(Math.abs(pair[0].start-pair[1].start)<=1,phase+" starts both effects together");assert.equal(pair[0].position,pair[1].position,phase+" keeps the visible gradient sweep in sync");if(phase!=="initial"&&phase!=="refresh")for(const [index,clock] of pair.entries()){assert.equal(clock.start,result.shimmer.initial[index].start,phase+" does not restart either shimmer");assert.ok(clock.current>=result.shimmer.initial[index].current,phase+" preserves advancing playback");}}
    }
    const detail=result.detail,staticReveal={marked:0,animations:[]};
    assert.deepEqual(detail.initial,staticReveal);assert.equal(detail.initialStarts,0);assert.equal(detail.manualFocus,true);assert.equal(detail.removedControls,0);
    assert.deepEqual(detail.afterEnd,staticReveal,'role reveal clears after actual animationend');assert.deepEqual(detail.refresh,{...staticReveal,oldClean:true,focus:true},'refresh preserves role focus and clears transient motion');
    const animated=['manual','switch','coexist'];if(mode.width>560){for(const field of ['bodyFocused','shiftReturned','escapeReturned'])assert.equal(detail[field],true,field+' retains role keyboard navigation');}else{for(const field of ['enterClosed','spaceOpened','closeImmediate','closedHidden'])assert.equal(detail[field],true,field+' retains native role disclosures');assert.deepEqual(detail.closed,staticReveal);animated.push('keyboard');}
    for(const field of animated){assert.equal(detail[field].marked,mode.reduced?0:1,field+' marks one role detail');assert.equal(detail[field].animations.length,mode.reduced?0:1);for(const animation of detail[field].animations){assert.ok(animation.duration>=140&&animation.duration<=200);assert.equal(animation.iterations,1);assert.equal(animation.name,mode.width>560?'sc-preview-reveal':'sc-detail-reveal');if(mode.width>560)assert.equal(animation.transform,'none');}}
    if(!mode.reduced){assert.deepEqual(detail.firstStarts,['dev']);assert.deepEqual(detail.firstEnds,['dev']);assertFlow(detail.coexist.handoff,'cr',false,'role/handoff coexistence');assert.equal(detail.coexist.handoff.activeAnimation,'sc-running-pulse');}else{assert.deepEqual(detail.starts,[]);assert.deepEqual(detail.ends,[]);}
    const dynamic=result.dynamicReturn;
    assert.equal(dynamic.unchanged,true);assert.equal(dynamic.sameSvg,true,"resize updates the same lifecycle SVG");
    assert.equal(result.returnInteraction.sameLayout,true,"focus and hover preserve card, preview and view geometry during a return");assert.equal(result.returnInteraction.focus,true);assert.ok(result.returnInteraction.scrollWidth<=mode.width);
    assertQuiet(motionOnly(result.afterReturnEnd),"natural return completion");assert.equal(result.afterReturnEnd.observers.live,0);
    for(const lifecycle of result.returnLifecycle){
      assertQuiet(lifecycle.after,lifecycle.action+" clears return feedback");assertQuiet(lifecycle.noReplay,lifecycle.action+" does not resume a consumed ID");assert.equal(lifecycle.callbacksStable,true,lifecycle.action+" disconnects geometry updates");assert.equal(lifecycle.observers.live,0);assert.equal(lifecycle.preferenceRestored,true);
      assert.equal(lifecycle.observerBefore.created,mode.reduced?0:1);assert.equal(lifecycle.observerBefore.live,mode.reduced?0:1);assert.equal(lifecycle.observers.created,mode.reduced?0:1);
      if(mode.reduced)assertQuiet(motionOnly(lifecycle.before),lifecycle.action);else assertFlow(lifecycle.before,"dev",true,lifecycle.action);
      if(lifecycle.action==="reduce")assert.equal(lifecycle.mediaChanged,!mode.reduced,"the running cancellation uses a real media-preference change");
    }
    assert.deepEqual(result.returnLifecycle.map(item=>item.action),["same-id","pause","task-switch","reduce"]);
    assert.deepEqual(result.rounds.map(item=>item.id),["round-return-1","round-submit-1","round-return-2","round-submit-2","round-qa"]);
    for(const [index,round] of result.rounds.entries()){
      assert.equal(round.unchanged,true);assert.deepEqual(round.order,["req","dev","cr","qa"]);assertQuiet(round.ended,round.id+" ends naturally");assertQuiet(round.afterSameId,round.id+" does not replay");assert.equal(round.afterObservers.live,0);
      if(mode.reduced){assertQuiet(motionOnly(round.during),round.id);assert.equal(round.observers.created,0);}else{assertFlow(round.during,round.to,round.to==="dev",round.id);assert.equal(round.observers.live,round.to==="dev"?1:0);assert.equal(round.afterObservers.created,index<2?1:2);if(round.to==="dev")assertReturnStyle(round.during,round.id);else assert.equal(round.during.geometry,null,"resubmission and CR-passed QA handoff have no return SVG or historical replay");}
    }
    assert.equal(result.cancelObservers.live,0,"CSS cancellation disconnects the return observer");
    if(mode.reduced){assert.equal(dynamic.initial,null);assert.equal(dynamic.resized,null);assert.equal(dynamic.afterResize.created,0);assert.equal(result.returnSweep,null);assert.deepEqual(result.returnEndEvents,[]);}
    else{
      for(const field of ["initial","closed","reopened","resized"])assertReturnGeometry(dynamic[field],field);
      assert.notEqual(dynamic.resized.path,dynamic.reopened.path,"native resize recomputes the path after card height grows");assert.ok(dynamic.afterResize.callbacks>dynamic.beforeResize.callbacks);assert.equal(dynamic.afterResize.live,1);assert.deepEqual(dynamic.afterResize.targetCounts,[3]);
      if(mode.width<=560)assert.notEqual(dynamic.closed.path,dynamic.reopened.path,"native inline disclosure changes return endpoints");
      assert.equal(result.returnSweep.duration,650);assert.equal(result.returnSweep.iterations,1);const offsets=result.returnSweep.offsets;assert.ok(Math.abs(offsets[0]-12)<=.1&&offsets[0]>offsets[1]&&offsets[1]>offsets[2]&&offsets[2]<-95,"the short light advances from source to receiver exactly once");
      assert.deepEqual(result.returnEndEvents.sort(),["sc-handoff-receive/::after","sc-handoff-return/"],"SVG light and receiving card dispatch native completion events");
    }
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
    assert.deepEqual(result.cancelEvents.sort(), ["sc-handoff-receive/::after","sc-handoff-return/"], "Chrome must dispatch actual cancellation for SVG light and receiver");
    assert.equal(result.cancelClock.length, 2, "both cancellable CSS effects must have started");
    assert.ok(result.cancelClock.every(clock => Number.isFinite(clock.start) && clock.time > 0), "CSS effects must be ready and time must advance before cancellation");
    for (const item of [result.forward, result.reverse]) {
      assert.equal(item.flowAnimation, item.reverse?"sc-handoff-return":"sc-handoff-flow");
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
    assert.equal(result.reverse.flowDirection, "normal", "SVG path itself follows the return direction");
    assertReturnStyle(result.reverse,"reverse");
    for(const item of [result.forward]){assert.equal(item.headTransform,'matrix(1, 0, 0, 1, -4, 0)');assert.equal(item.headLeft,'4px');assert.equal(item.headRight,'4px');assert.equal(item.headLeftColor,'rgba(0, 0, 0, 0)');assert.equal(item.headRightColor,'rgba(0, 0, 0, 0)');}
    assert.equal(result.forward.headTop,'7px');assert.equal(result.forward.headBottom,'0px');assert.equal(result.forward.headTopColor,result.forward.color,'forward solid triangle must point down');
    assert.equal(result.reverse.headTransform,undefined,"return arrow is an SVG open tip rather than a reversed triangle");
  }
  console.log("SC handoff motion independent Chrome regression passed (360px, 960px, reduced motion).");
} finally {
  assert.equal(ownedChrome.size, 0, `Isolated Chrome is still open; retained temporary files: ${temp}`);
  fs.rmSync(temp, { recursive: true, force: true });
} })().catch(error => { console.error(error); process.exitCode = 1; });
