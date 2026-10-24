"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find(fs.existsSync);
assert.ok(chrome, "Chrome is required for the SC UI behavior regression test");

const template = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sc-ui-behavior-"));
const page = path.join(temp, "test.html");
const profile = path.join(temp, "chrome-profile");
const snapshot = {
  view_id: "sc-task-view:QA-SC-MOTION-001",
  state: "ready_for_cr",
  work_unit: { work_unit_id: "QA-SC-MOTION-001", target: "accordion rerender", reference_version: "748c46b", roles: ["req", "dev", "cr", "qa"] },
  role_details: { req: { status: "passed", progress: "25" }, cr: { status: "running", progress: 120 }, qa: { status: "pending", progress: -25 } },
  handoffs: [],
};
const harness = `<!doctype html><html><body><main id="root">${template}</main><script>
window.onerror=(message,source,line,column,error)=>document.body.dataset.scTestError=String(message)+" at "+line+":"+column+" "+error?.stack;
const root=document.getElementById("root");
let toggleAdds=0,toggleRemoves=0;
const add=root.addEventListener.bind(root),remove=root.removeEventListener.bind(root);
root.addEventListener=(type,listener,options)=>{if(type==="toggle")toggleAdds++;return add(type,listener,options)};
root.removeEventListener=(type,listener,options)=>{if(type==="toggle")toggleRemoves++;return remove(type,listener,options)};
const snapshot=${JSON.stringify(snapshot)};
const openRoles=()=>[...root.querySelectorAll("details[data-sc-role][open]")].map(node=>node.dataset.scRole);
const hasProgress=role=>!!root.querySelector('details[data-sc-role="'+role+'"] [role="progressbar"]');
const stateRoot=root.cloneNode(true);stateRoot.removeAttribute('id');document.body.append(stateRoot);
const lifecycleSnapshot={view_id:'lifecycle:A',state:'dev_in_progress',work_unit:{roles:['req','dev']},role_details:{req:{status:'passed'},dev:{status:'running'}}};
const observeLifecycle=()=>({active:[...stateRoot.querySelectorAll('[data-sc-role].is-active')].map(n=>n.dataset.scRole),open:[...stateRoot.querySelectorAll('[data-sc-role][open]')].map(n=>n.dataset.scRole),current:[...stateRoot.querySelectorAll('[aria-current=step]')].map(n=>n.dataset.scRole)});
const lifecycleBefore=JSON.stringify(lifecycleSnapshot),lifecycle={stops:{},repairs:{}};
for(const state of ['needs_user_confirm','paused','waiting','blocked','qa_passed','workflow_ready','completed','complete','done','success','successful','succeeded','failed','cancelled','canceled']){window.renderSurveyCorpsTaskView(stateRoot,{...lifecycleSnapshot,state});lifecycle.stops[state]=observeLifecycle();}
for(const state of ['cr_blocked','qa_failed','qa_conditional']){window.renderSurveyCorpsTaskView(stateRoot,{...lifecycleSnapshot,state});lifecycle.repairs[state]=observeLifecycle();}
lifecycle.phases={};
for(const [state,owner] of [['ready_for_cr','cr'],['ready_for_qa','qa']])for(const status of ['pending','running']){window.renderSurveyCorpsTaskView(stateRoot,{view_id:'phase:'+state, state,work_unit:{roles:['dev','cr','qa']},role_details:{dev:{status:'passed'},cr:{status:owner==='qa'?'passed':'pending'},qa:{status:'pending'},[owner]:{status}}});lifecycle.phases[state+':'+status]={...observeLifecycle(),label:stateRoot.querySelector('[data-sc-field=state]').textContent};}
lifecycle.qaGate={};
for(const status of ['pending','running','blocked','needs_user_confirm',undefined,'completed',' PASSED ']){
  window.renderSurveyCorpsTaskView(stateRoot,{view_id:'qa-gate:'+String(status),state:'ready_for_qa',work_unit:{roles:['dev','cr','qa']},role_details:{dev:{status:'passed'},cr:status===undefined?{}:{status},qa:{status:'running'}}});
  lifecycle.qaGate[String(status)]={...observeLifecycle(),animation:getComputedStyle(stateRoot.querySelector('[data-sc-role=qa]')).animationName};
}
window.renderSurveyCorpsTaskView(stateRoot,{view_id:'qa-gate:unselected-cr',state:'ready_for_qa',work_unit:{roles:'qa'},role_details:{cr:{status:'passed'},qa:{status:'running'}}});
lifecycle.qaGate.unselectedCr={...observeLifecycle(),animation:getComputedStyle(stateRoot.querySelector('[data-sc-role=qa]')).animationName};
window.renderSurveyCorpsTaskView(stateRoot,lifecycleSnapshot);
stateRoot.querySelector('[data-sc-role=dev]').open=false;stateRoot.querySelector('[data-sc-role=req]').open=true;
window.renderSurveyCorpsTaskView(stateRoot,lifecycleSnapshot);lifecycle.sameView=observeLifecycle();
stateRoot.querySelector('[data-sc-role=req]').open=false;
window.renderSurveyCorpsTaskView(stateRoot,lifecycleSnapshot);lifecycle.manuallyClosed=observeLifecycle();
const switched={...lifecycleSnapshot,view_id:'lifecycle:B'};window.renderSurveyCorpsTaskView(stateRoot,switched);lifecycle.newView=observeLifecycle();
stateRoot.querySelector('[data-sc-role=dev]').open=false;stateRoot.querySelector('[data-sc-role=req]').open=true;
window.renderSurveyCorpsTaskView(stateRoot,{...switched,work_unit:{roles:['dev']}});lifecycle.removedSelection=observeLifecycle();
window.renderSurveyCorpsTaskView(stateRoot,{...switched,state:'paused'});lifecycle.paused=observeLifecycle();
window.renderSurveyCorpsTaskView(stateRoot,switched);lifecycle.resumed=observeLifecycle();
lifecycle.unchanged=JSON.stringify(lifecycleSnapshot)===lifecycleBefore;
const focusSnapshot={...switched,role_details:{dev:{status:'running',subskills:[{name:'tech-select',summary:'方案记录'}]}}},focus={};
const focusRole=()=>stateRoot.querySelector('[data-sc-role=dev] > summary');
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focusRole().focus();focus.initial=document.activeElement===focusRole();
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focus.role=document.activeElement===focusRole();
focusSnapshot.role_details.dev.subskills.push({name:'refactor-with-goal',summary:'已更新记录'});window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focus.recordUpdate=document.activeElement===focusRole();
window.renderSurveyCorpsTaskView(stateRoot,{...focusSnapshot,work_unit:{roles:[]}});focus.removedRole=!stateRoot.contains(document.activeElement);
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focusRole().focus();window.renderSurveyCorpsTaskView(stateRoot,{...focusSnapshot,view_id:'focus:new-task'});focus.newTask=!stateRoot.contains(document.activeElement);
const outside=document.createElement('button');document.body.append(outside);outside.focus();window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focus.outside=document.activeElement===outside;outside.remove();
stateRoot.remove();
window.renderSurveyCorpsTaskView(root,snapshot);
const initialToggleListeners=toggleAdds-toggleRemoves;
const initial=openRoles(),progress={req:hasProgress("req"),dev:hasProgress("dev"),cr:hasProgress("cr"),qa:hasProgress("qa")};
const waitingSnapshot=structuredClone(snapshot);waitingSnapshot.state="ready_for_qa";waitingSnapshot.role_details={req:{status:"passed"},dev:{status:"passed"},cr:{status:"pending"},qa:{status:"pending"}};window.renderSurveyCorpsTaskView(root,waitingSnapshot);const waitingActive=[...root.querySelectorAll('details[data-sc-role].is-active')].map(node=>node.dataset.scRole);window.renderSurveyCorpsTaskView(root,snapshot);
const finishedDev=structuredClone(waitingSnapshot);finishedDev.state="dev_in_progress";window.renderSurveyCorpsTaskView(root,finishedDev);const finishedDevActive=[...root.querySelectorAll('details[data-sc-role].is-active')].map(node=>node.dataset.scRole);window.renderSurveyCorpsTaskView(root,snapshot);
const flow={roles:[...root.querySelectorAll("details[data-sc-role]")].map(node=>node.dataset.scRole),titles:[...root.querySelectorAll("details[data-sc-role] summary .sc-task-view__role-name > span:first-child")].map(node=>node.textContent),lastRole:root.querySelector("[data-sc-roles]").lastElementChild?.dataset.scRole,extraExitNodes:root.querySelectorAll("[data-sc-exit], .sc-task-view__exit").length,exitTextCount:root.querySelector("[data-sc-roles]").textContent.split("任务出口").length-1,connectorCount:root.querySelectorAll("[data-sc-connector], .sc-task-view__connector").length,firstNode:root.querySelector("[data-sc-roles]").firstElementChild?.dataset.scRole};
const frameBorders={context:getComputedStyle(root.querySelector('[data-sc-root]')),preview:getComputedStyle(root.querySelector('[data-sc-role-preview]')),role:getComputedStyle(root.querySelector('[data-sc-role=cr]')),roleDivider:getComputedStyle(root.querySelector('[data-sc-role=cr] .sc-task-view__role-name')),previewDivider:getComputedStyle(root.querySelector('[data-sc-preview-body] .sc-task-view__detail'))};
const defaults={summary:root.querySelector('[data-sc-preview-summary]').textContent,summaryDom:root.querySelector('[data-sc-preview-summary]').childElementCount,bottomSummary:root.querySelectorAll('[data-sc-task-summary],.sc-task-view__task-summary').length,selected:root.querySelector('[data-sc-selected-roles]').textContent,contextRemoved:!root.querySelector('[data-sc-context]'),namesRemoved:!root.querySelector('[data-sc-agent-name]'),projectMcpsHidden:root.querySelector('[data-sc-project-mcps]').hidden,debugHidden:root.querySelector('[data-sc-play-animation]').hidden,autoMotion:root.querySelector('.sc-task-view').classList.contains('is-entering'),previewHeaders:root.querySelectorAll('.sc-task-view__preview-heading,.sc-task-view__preview-identity,[data-sc-preview-role],[data-sc-preview-state],[data-sc-preview-metrics]').length,frameBorders:{context:frameBorders.context.borderTopWidth,preview:frameBorders.preview.borderTopWidth,role:frameBorders.role.borderTopWidth,roleDivider:frameBorders.roleDivider.borderRightWidth,previewDivider:frameBorders.previewDivider.borderTopWidth},connectorGeometry:[...root.querySelectorAll('.sc-task-view__connector')].map(node=>({before:getComputedStyle(node,"::before").content,after:getComputedStyle(node,"::after").content,headTop:getComputedStyle(node,"::after").borderTopWidth}))};
root.querySelector('details[data-sc-role="cr"]').open=false;
root.querySelector('details[data-sc-role="req"]').open=true;
window.renderSurveyCorpsTaskView(root,snapshot);
const sameSnapshot=openRoles();
const next=structuredClone(snapshot);next.state="ready_for_qa";next.role_details.cr.status="passed";next.role_details.qa.status="running";
window.renderSurveyCorpsTaskView(root,next,{debug:true});
const changedActive=openRoles(),stateBefore=root.querySelector('[data-sc-field="state"]').textContent;
root.querySelector("[data-sc-play-animation]").click();
const afterReplay=openRoles(),stateAfter=root.querySelector('[data-sc-field="state"]').textContent;
const activeToggleListeners=toggleAdds-toggleRemoves;
const debugTrue={hidden:root.querySelector('[data-sc-play-animation]').hidden,replay:root.querySelector('details.is-active').classList.contains('is-manual-replay')};
window.renderSurveyCorpsTaskView(root,next,{debug:'true'});
root.querySelector('[data-sc-play-animation]').click();
const debugString={hidden:root.querySelector('[data-sc-play-animation]').hidden,replay:!!root.querySelector('.is-manual-replay')};
window.renderSurveyCorpsTaskView(root,next);
root.querySelector('[data-sc-play-animation]').click();
const debugDefault={hidden:root.querySelector('[data-sc-play-animation]').hidden,replay:!!root.querySelector('.is-manual-replay')};
window.renderSurveyCorpsTaskView(root,next,{debug:false});root.querySelector('[data-sc-play-animation]').click();
const debugFalse={hidden:root.querySelector('[data-sc-play-animation]').hidden,replay:!!root.querySelector('.is-manual-replay')};
const snapshotDebug=structuredClone(next);snapshotDebug.debug=true;window.renderSurveyCorpsTaskView(root,snapshotDebug);root.querySelector('[data-sc-play-animation]').click();
const debugInSnapshot={hidden:root.querySelector('[data-sc-play-animation]').hidden,replay:!!root.querySelector('.is-manual-replay')};
const supplied=structuredClone(next),payload='<img src=x onerror="window.qaInjected=true">';
supplied.work_unit={project_name:'kyojin',project_mcps:['codegraph','CodeGraph','filesystem',payload,42,'  '],target:'明确目标',task_type:'界面调整',roles:['dev','qa'],role_selection_reason:'仅实现和验收；此说明专门用于验证长文本始终在元数据值列内自然换行，且不会挤占左侧标签列。',summary:payload,scope:['当前任务视图'],acceptance:['QA 唯一出口'],environment:'Windows Chrome'};
supplied.work_unit.metrics={elapsed_ms:90061000,total_tokens:12345};
supplied.role_details.req.agent_name='req-agent';supplied.role_details.dev={status:'passed',agent_name:'dev-agent',metrics:{elapsed_ms:65000,total_tokens:2345}};supplied.role_details.cr.agent_name='cr-agent';
supplied.role_details.qa.agent_name=payload;
window.renderSurveyCorpsTaskView(root,supplied);
supplied.state='completed';supplied.role_details.qa.status='passed';window.renderSurveyCorpsTaskView(root,supplied);
const summary=root.querySelector('[data-sc-preview-summary]');
const metadata=root.querySelector('.sc-task-view__metadata'),taskTypeLabel=metadata.querySelector('dt'),taskTypeValue=metadata.querySelector('dd'),reasonValue=metadata.querySelector('[data-sc-field=role_selection_reason]'),metadataRect=metadata.getBoundingClientRect(),taskTypeLabelRect=taskTypeLabel.getBoundingClientRect(),taskTypeValueRect=taskTypeValue.getBoundingClientRect(),reasonValueRect=reasonValue.getBoundingClientRect(),metadataStyles=getComputedStyle(metadata),reasonStyles=getComputedStyle(reasonValue),metadataLayout={className:metadata.className,gridTemplateColumns:metadataStyles.gridTemplateColumns,alignItems:metadataStyles.alignItems,labelTextAlign:getComputedStyle(taskTypeLabel).textAlign,labelValueTopDelta:Math.abs(taskTypeLabelRect.top-taskTypeValueRect.top),valueStartsAfterLabel:taskTypeValueRect.left>=taskTypeLabelRect.right,reasonWraps:reasonValueRect.height>parseFloat(reasonStyles.lineHeight),reasonFits:reasonValueRect.right<=metadataRect.right+1};
const projectMcps=root.querySelector('[data-sc-project-mcps]'),provided={headerText:root.querySelector('.sc-task-view__header').innerText,taskType:root.querySelector('[data-sc-field=task_type]').textContent,selected:root.querySelector('[data-sc-selected-roles]').textContent,reason:root.querySelector('[data-sc-field=role_selection_reason]').textContent,summary:summary.querySelector('p').textContent,summaryTitle:summary.querySelector('h3')?.textContent,summaryInsideAside:summary.closest('[data-sc-role-preview]')===root.querySelector('[data-sc-role-preview]'),visibleSummaryCount:[...root.querySelectorAll('[data-sc-preview-summary]')].filter(n=>n.checkVisibility({visibilityProperty:true})).length,summaryAfterQA:!!(root.querySelector('[data-sc-role=qa]').compareDocumentPosition(summary)&Node.DOCUMENT_POSITION_FOLLOWING),roleCount:root.querySelectorAll('details[data-sc-role]').length,contextRemoved:!root.querySelector('[data-sc-context]'),namesRemoved:!root.querySelector('[data-sc-agent-name]'),projectMcps:{hidden:projectMcps.hidden,open:projectMcps.open,count:root.querySelector('[data-sc-project-mcp-count]').textContent,names:[...root.querySelectorAll('[data-sc-project-mcp-list] li')].map(node=>node.textContent)},injectedElements:root.querySelectorAll('img').length,metadataLayout};
provided.metrics={taskElapsed:root.querySelector('[data-sc-metric=task-elapsed]').textContent,devElapsed:root.querySelector('[data-sc-role=dev] > summary .sc-task-view__role-elapsed > span').textContent,tokenNodes:root.querySelectorAll('[data-sc-metric=task-tokens]').length,tokenText:/Token|12,345|2,345/.test(root.textContent),roleMetricCount:root.querySelectorAll('[data-sc-role=dev] > summary .sc-task-view__role-elapsed > span').length};
supplied.work_unit.metrics={elapsed_ms:-1,total_tokens:'999'};supplied.role_details.dev.metrics={elapsed_ms:1.5,total_tokens:-2};window.renderSurveyCorpsTaskView(root,supplied);
const invalidMetrics=[root.querySelector('[data-sc-metric=task-elapsed]').textContent,...[...root.querySelectorAll('[data-sc-role=dev] > summary .sc-task-view__role-elapsed > span')].map(node=>node.textContent)];
delete supplied.work_unit.metrics;delete supplied.role_details.dev.metrics;window.renderSurveyCorpsTaskView(root,supplied);
const missingMetrics=[root.querySelector('[data-sc-metric=task-elapsed]').textContent,...[...root.querySelectorAll('[data-sc-role=dev] > summary .sc-task-view__role-elapsed > span')].map(node=>node.textContent)];
supplied.work_unit.metrics={elapsed_ms:90061000,total_tokens:12345};supplied.role_details.dev.metrics={elapsed_ms:65000,total_tokens:2345};window.renderSurveyCorpsTaskView(root,supplied);
delete supplied.role_details.qa.agent_name;delete supplied.work_unit.summary;delete supplied.work_unit.project_mcps;window.renderSurveyCorpsTaskView(root,supplied);
const removed={headerText:root.querySelector('.sc-task-view__header').innerText,contextRemoved:!root.querySelector('[data-sc-context]'),namesRemoved:!root.querySelector('[data-sc-agent-name]'),projectMcpsHidden:root.querySelector('[data-sc-project-mcps]').hidden,summary:root.querySelector('[data-sc-preview-summary] p').textContent,summaryClass:root.querySelector('[data-sc-preview-summary] p').className};
const roleCases={pending:'待开始',running:'进行中',passed:'通过',blocked:'阻断',needs_user_confirm:'待用户确认'};
const roleStatuses={};const roleStatusClasses={};for(const status of Object.keys(roleCases)){supplied.role_details.qa.status=status;window.renderSurveyCorpsTaskView(root,supplied);const node=root.querySelector('[data-sc-role=qa] .sc-task-view__role-state');roleStatuses[status]=node.textContent;roleStatusClasses[status]=node.className;}
const globalCases={confirmed:'已确认',planned:'计划',dev_in_progress:'开发中',ready_for_cr:'审查阶段',cr_blocked:'审查阻断',ready_for_qa:'测试阶段',qa_failed:'测试失败',qa_conditional:'测试条件通过',qa_passed:'测试通过',workflow_ready:'任务完成',completed:'已完成',complete:'已完成',done:'已完成',success:'已完成',successful:'已完成',succeeded:'已完成',failed:'失败',paused:'已暂停',waiting:'等待中',cancelled:'已取消',canceled:'已取消',needs_user_confirm:'等待用户确认',needs_revalidation:'需要重新验证',needs_revision:'需要修订',blocked:'已阻断'};
const globalStatuses={};const globalStatusClasses={};for(const state of Object.keys(globalCases)){supplied.state=state;window.renderSurveyCorpsTaskView(root,supplied);const node=root.querySelector('[data-sc-field=state]');globalStatuses[state]=node.textContent;globalStatusClasses[state]=node.className;}
supplied.state=payload;supplied.role_details.qa.status=payload;window.renderSurveyCorpsTaskView(root,supplied);
const unknown={global:root.querySelector('[data-sc-field=state]').textContent,role:root.querySelector('[data-sc-role=qa] .sc-task-view__role-state').textContent,img:root.querySelectorAll('img').length};
const prototypeFallbacks=[];for(const status of ['constructor','__proto__','toString']){supplied.role_details.qa.status=status;window.renderSurveyCorpsTaskView(root,supplied);prototypeFallbacks.push(root.querySelector('[data-sc-role=qa] .sc-task-view__role-state').textContent);}
const pendingBodies=[];for(const role of ['req','dev','cr','qa']){const pending=structuredClone(next),names={req:'align-with-visuals',dev:'tech-select',cr:'review-with-goal',qa:'test-with-goal'};pending.role_details[role]={status:'pending',summary:payload,evidence:[payload],risks:[payload],next_action:payload,metrics:{elapsed_ms:99},subskills:[{name:names[role],summary:payload}]};window.renderSurveyCorpsTaskView(root,pending);const body=root.querySelector('[data-sc-role='+role+'] > [data-sc-detail-body]');pendingBodies.push({role,text:body.textContent,children:body.childElementCount,controls:body.querySelectorAll('summary,button,input,a').length});}
const boundaries=[];
const observe=()=>({roles:[...root.querySelectorAll('details[data-sc-role]')].map(n=>n.dataset.scRole),active:[...root.querySelectorAll('details.is-active')].map(n=>n.dataset.scRole),open:openRoles(),state:root.querySelector('[data-sc-field=state]').textContent});
for(const roles of [[],['invalid'],['dev','cr'],['qa','dev']]){window.renderSurveyCorpsTaskView(root,{work_unit:{roles},role_details:{dev:{status:'running'},qa:{status:'running'}},state:'dev_in_progress'});boundaries.push(observe());}
window.renderSurveyCorpsTaskView(root,{state:'dev_in_progress',work_unit:{roles:['qa']}});const excludedFallback=observe();
const invalidStates=[];for(const state of [null,[],{}, {toString:null},true,42,'__proto__']){window.renderSurveyCorpsTaskView(root,{state,work_unit:{roles:['dev']}});invalidStates.push(observe().state);}
window.renderSurveyCorpsTaskView(root,{state:'planned'});const emptyView=observe();
window.renderSurveyCorpsTaskView(root,snapshot);const recovered=observe();
// SC-HIDE-MISSING, P1: data blanks preserve headings, supplied values and semantic state messages.
const missingData=[];
for(const [name,value] of [['zero',0],['false',false],['literal','未提供'],['malicious',payload],['absent'],['undefined',undefined],['null',null],['empty-string',''],['empty-array',[]],['mixed',[undefined,null,'','  ',0,false,'未提供',payload]]]){
  const work={roles:['dev']},detail={status:'passed'};
  if(name!=='absent'){for(const field of ['summary','evidence','risks','next_action'])detail[field]=value;if(!Array.isArray(value))for(const field of ['target','task_type','role_selection_reason'])work[field]=value;}
  window.renderSurveyCorpsTaskView(root,{view_id:'missing-data',state:'dev_in_progress',work_unit:work,role_details:{dev:detail}});
  const body=root.querySelector('[data-sc-role=dev] > [data-sc-detail-body]'),headings=[...body.querySelectorAll(':scope > section > h3')];
  missingData.push({name,metadata:['target','task_type','role_selection_reason'].map(field=>root.querySelector('[data-sc-field='+field+']').textContent),headings:headings.map(node=>node.textContent),contents:headings.map(node=>({text:node.nextElementSibling.textContent,items:[...node.nextElementSibling.querySelectorAll('li')].map(item=>item.textContent),children:node.nextElementSibling.childElementCount})),injectedElements:root.querySelectorAll('img').length,executed:window.qaInjected===true});
}
const missingStateLabels=[];for(const status of [undefined,null,'']){window.renderSurveyCorpsTaskView(root,{state:'dev_in_progress',work_unit:{roles:['dev']},role_details:{dev:{status,subskills:[{name:'tech-select',status,summary:'有效记录'}]}}});missingStateLabels.push({role:root.querySelector('[data-sc-role=dev] > summary .sc-task-view__role-state').textContent,subskill:root.querySelector('[data-sc-role=dev] > summary .sc-task-view__role-subskill').textContent});}
const elapsedBoundaries=[];for(const elapsed of [0,1,999,1000]){const sample={work_unit:{metrics:{elapsed_ms:elapsed},roles:[]}};window.renderSurveyCorpsTaskView(root,sample);elapsedBoundaries.push(root.querySelector('[data-sc-metric=task-elapsed]').textContent);}
const result={missingData,missingStateLabels,pendingBodies,focus,lifecycle,boundaries,excludedFallback,invalidStates,emptyView,recovered,initial,sameSnapshot,changedActive,afterReplay,stateBefore,stateAfter,progress,waitingActive,finishedDevActive,flow,defaults,debugTrue,debugString,debugDefault,debugFalse,debugInSnapshot,provided,invalidMetrics,missingMetrics,elapsedBoundaries,payload,removed,roleCases,roleStatuses,roleStatusClasses,globalCases,globalStatuses,globalStatusClasses,unknown,prototypeFallbacks,toggleAdds,toggleRemoves,initialToggleListeners,activeToggleListeners};
document.body.dataset.scTestResult=JSON.stringify(result);
</script></body></html>`;

// QA role-subskills-auto-height, P1: unique valid names retain first occurrence order; the last running record selects one name.
const roleLineCases = [
  {"name":"active-running-priority","status":"running","skills":[{"name":"tech-select","status":"running","summary":"执行记录"},{"name":"refactor-with-goal","status":"passed","summary":"历史记录"}],"active":true,"texts":["tech-select","refactor-with-goal"],"runningIndex":0},
  {"name":"active-last-running","status":"running","skills":[{"name":"tech-select","status":"running","summary":"首项"},{"name":"bug-fix","status":"running","summary":"后项"},{"name":"optimize","status":"completed","summary":"历史"}],"active":true,"texts":["tech-select","bug-fix","optimize"],"runningIndex":1},
  {"name":"active-exact-running","status":"running","skills":[{"name":"tech-select","status":"running","summary":"精确状态"},{"name":"refactor-with-goal","status":" RUNNING ","summary":"非精确状态"}],"active":true,"texts":["tech-select","refactor-with-goal"],"runningIndex":0},
  {"name":"active-fallback","status":"running","skills":[{"name":"tech-select","status":"preparing","summary":"旧别名"},{"name":"refactor-with-goal","status":"passed","summary":"后项"}],"active":true,"texts":["tech-select","refactor-with-goal"],"runningIndex":-1},
  {"name":"passed-history","status":"passed","skills":[{"name":"tech-select","status":"running","summary":"旧进行中"},{"name":"refactor-with-goal","status":"passed","summary":"已完成"}],"active":false,"texts":["tech-select","refactor-with-goal"],"runningIndex":-1},
  {"name":"stopped-history","state":"completed","status":"running","skills":[{"name":"tech-select","status":"running","summary":"旧执行"},{"name":"refactor-with-goal","status":"passed","summary":"后项"}],"active":false,"texts":["tech-select","refactor-with-goal"],"runningIndex":-1},
  {"name":"conflicting-activity-history","status":"running","conflict":true,"skills":[{"name":"tech-select","status":"running","summary":"执行"},{"name":"refactor-with-goal","status":"passed","summary":"后项"}],"active":false,"texts":["tech-select","refactor-with-goal"],"runningIndex":-1},
  {"name":"pending-blank","status":"pending","skills":[{"name":"tech-select","status":"running","summary":"不得展示"}],"active":false,"texts":[],"runningIndex":-1},
  {"name":"invalid-record-filter","status":"running","skills":[null,"tech-select",{},{"name":"test-with-goal","summary":"错误所属"},{"name":"constructor","summary":"非法名称"},{"name":"tech-select","status":"running","evidence":["有效证据"]},{"name":"refactor-with-goal","status":"running","goal":42,"summary":{"bad":true},"options":["不足以成有效记录"]}],"active":true,"texts":["tech-select"],"runningIndex":0},
  {"name":"no-valid-record","status":"passed","skills":[{"name":"tech-select","status":"running","summary":"  ","evidence":[null," "]}],"active":false,"texts":[],"runningIndex":-1},
  {"name":"missing-records","status":"passed","active":false,"texts":[],"runningIndex":-1},
  {"name":"nonarray-records","status":"passed","skills":{"name":"tech-select","summary":"不可视为数组"},"active":false,"texts":[],"runningIndex":-1},
  {"name":"missing-role-status-history","skills":[{"name":"tech-select","summary":"已有记录"}],"active":false,"texts":["tech-select"],"runningIndex":-1},
  {"name":"long-name","status":"running","skills":[{"name":"refactor-with-goal","summary":"长名称","status":"running"}],"active":true,"texts":["refactor-with-goal"],"runningIndex":0},
  {"name":"req-history","role":"req","status":"passed","skills":[{"name":"align-with-visuals","summary":"对齐记录"}],"active":false,"texts":["align-with-visuals"],"runningIndex":-1},
  {"name":"cr-history","role":"cr","status":"passed","skills":[{"name":"review-with-goal","summary":"审查记录"},{"name":"review-with-goal","status":"passed","summary":"后轮审查记录"}],"active":false,"texts":["review-with-goal"],"runningIndex":-1},
  {"name":"qa-active","role":"qa","status":"running","skills":[{"name":"test-with-goal","summary":"测试记录","status":"running"},{"name":"test-with-goal","status":"passed","summary":"测试历史仍仅同一名称"}],"active":true,"texts":["test-with-goal"],"runningIndex":0},
  {"name":"duplicate-prior-running","status":"running","skills":[{"name":"tech-select","status":"running","summary":"前轮执行"},{"name":"tech-select","status":"completed","summary":"后轮完成"}],"active":true,"texts":["tech-select"],"runningIndex":0},
  {"name":"duplicate-invalid-running","status":"running","skills":[{"name":"tech-select","status":"running"},{"name":"tech-select","status":"completed","summary":"有效完成"}],"active":true,"texts":["tech-select"],"runningIndex":-1},
  {"name":"duplicate-last-running","status":"running","skills":[{"name":"tech-select","status":"completed","summary":"前轮完成"},{"name":"tech-select","status":"running","summary":"后轮执行"}],"active":true,"texts":["tech-select"],"runningIndex":0},
  {"name":"unknown-subskill-static","status":"running","skills":[{"name":"tech-select","status":"unknown","summary":"未知状态记录"}],"active":true,"texts":["tech-select"],"runningIndex":-1},
  {"name":"unknown-role-static","status":"unknown","skills":[{"name":"tech-select","status":"running","summary":"旧活动记录"}],"active":false,"texts":["tech-select"],"runningIndex":-1},
  {"name":"running-no-data-static","status":"running","active":true,"texts":[],"runningIndex":-1},
  {"name":"global-blocked-static","state":"blocked","status":"running","skills":[{"name":"tech-select","status":"running","summary":"已停止"}],"active":false,"texts":["tech-select"],"runningIndex":-1},
  {"name":"role-blocked-static","status":"blocked","skills":[{"name":"tech-select","status":"running","summary":"阻断角色"}],"active":false,"texts":["tech-select"],"runningIndex":-1},
  {"name":"qa-gated-static","role":"qa","status":"running","crStatus":"pending","skills":[{"name":"test-with-goal","status":"running","summary":"未过审"}],"active":false,"texts":["test-with-goal"],"runningIndex":-1}
];

const visualHarness = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root">${template}</main><script>
const root=document.getElementById('root'),snapshot=${JSON.stringify(snapshot)};
snapshot.role_details.cr.status='passed';
// The same fixtures run at exact 360/960 iframe widths; observed DOM is the oracle.
const lineRoot=root.cloneNode(true);lineRoot.removeAttribute('id');document.body.append(lineRoot);
const lineCases=${JSON.stringify(roleLineCases)},roleLines=[];
for(const item of lineCases){
  document.activeElement?.blur();const role=item.role||'dev';
  // A narrow desktop embed exercises real clipping with the longest allowed name.
  lineRoot.style.width=item.name==='long-name'&&innerWidth>560?'560px':'';lineRoot.style.maxWidth='100%';
  const input={view_id:'role-line:'+item.name,state:item.state||'dev_in_progress',work_unit:{roles:['req','dev','cr','qa']},role_details:{req:{status:'passed'},dev:{status:'passed'},cr:{status:'passed'},qa:{status:'pending'}}};
  input.role_details[role]={status:item.status,metrics:{elapsed_ms:1000},subskills:item.skills,next_action:'ROLE_NEXT_SHOULD_NOT_RENDER'};if(item.conflict)input.role_details.cr.status='running';if(item.crStatus)input.role_details.cr.status=item.crStatus;
  const before=JSON.stringify(input);window.renderSurveyCorpsTaskView(lineRoot,input);
  const card=lineRoot.querySelector('[data-sc-role='+role+']'),summary=card.querySelector(':scope > summary'),body=card.querySelector(':scope > [data-sc-detail-body]');
  const lines=[...summary.querySelectorAll('.sc-task-view__role-subskill')].map(line=>{const styles=getComputedStyle(line),rect=line.getBoundingClientRect();return {text:line.textContent,title:line.title,children:line.childElementCount,below:rect.top>=line.previousElementSibling.getBoundingClientRect().bottom-1,height:rect.height,lineHeight:parseFloat(styles.lineHeight),whiteSpace:styles.whiteSpace,overflow:styles.overflow,textOverflow:styles.textOverflow,animation:styles.animationName,color:styles.color,gradient:styles.backgroundImage,shimmer:line.classList.contains('is-status-running'),clipped:line.scrollWidth>line.clientWidth,fits:rect.right<=summary.getBoundingClientRect().right+1};});
  roleLines.push({name:item.name,lines,count:lines.length,removedUI:lineRoot.querySelectorAll('[data-sc-subskills],[data-sc-subskill],[data-sc-preview-subskill],[data-sc-subskill-field]').length,controls:body.querySelectorAll('details,summary,button,input,select,a').length,active:card.classList.contains('is-active'),unchanged:before===JSON.stringify(input),headings:[...body.querySelectorAll(':scope > section > h3')].map(node=>node.textContent),nextAbsent:!lineRoot.textContent.includes('ROLE_NEXT_SHOULD_NOT_RENDER')});
}
// QA role-subskills-auto-height: updates replace the authoritative list without retaining removed history.
const listHeights=[],heightPool=['tech-select','refactor-with-goal','bug-fix','bug-cause','optimize'].map((name,index)=>({name,status:'passed',summary:'历史记录'+index}));
const heightSpecs=[{key:'zero',skills:[]},{key:'one',skills:heightPool.slice(0,1)},{key:'three',skills:heightPool.slice(0,3)},{key:'five',skills:heightPool},{key:'duplicates',skills:[...heightPool,...heightPool]},{key:'shrink-one',skills:heightPool.slice(0,1)},{key:'remove-all',skills:[]},{key:'reorder',skills:[heightPool[4],heightPool[1],heightPool[0]]},{key:'nonarray-update',skills:{name:'tech-select',summary:'不得保留'}}];
for(const item of heightSpecs){
  document.activeElement?.blur();lineRoot.style.width='';const input={view_id:'height:updates',state:'dev_in_progress',work_unit:{roles:['req','dev','cr','qa']},role_details:{req:{status:'passed'},dev:{status:'running',subskills:item.skills},cr:{status:'pending'},qa:{status:'pending'}}},before=JSON.stringify(input);window.renderSurveyCorpsTaskView(lineRoot,input);
  const card=lineRoot.querySelector('[data-sc-role=dev]'),summary=card.querySelector(':scope > summary'),summaryRect=summary.getBoundingClientRect(),link=summary.querySelector('[data-sc-preview-link]').getBoundingClientRect(),workspace=lineRoot.querySelector('[data-sc-workspace]'),preview=lineRoot.querySelector('[data-sc-role-preview]'),previewRect=preview.getBoundingClientRect(),contextRect=lineRoot.querySelector('[data-sc-root]').getBoundingClientRect(),columns=getComputedStyle(workspace).gridTemplateColumns.split(' ').map(parseFloat),viewSize=()=>{const box=lineRoot.querySelector('.sc-task-view').getBoundingClientRect();return [box.width,box.height];},initial=viewSize();
  const borderWidths=node=>['Top','Right','Bottom','Left'].map(side=>getComputedStyle(node)['border'+side+'Width']);let interaction=null;
  if(innerWidth>560){const other=lineRoot.querySelector('[data-sc-role=cr] > summary');other.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));const hovered=viewSize();other.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}));other.focus();const focused=viewSize();other.blur();interaction={hovered,focused,returned:viewSize()};}
  listHeights.push({key:item.key,names:[...summary.querySelectorAll('.sc-task-view__role-subskill')].map(node=>node.textContent),summaryHeight:summaryRect.height,unchanged:before===JSON.stringify(input),initial,interaction,linkCenter:innerWidth>560?Math.abs(link.top+link.height/2-summaryRect.top-summaryRect.height/2):null,arrowCenters:[...lineRoot.querySelectorAll('.sc-task-view__connector')].map(node=>{const box=node.getBoundingClientRect(),previous=node.previousElementSibling.getBoundingClientRect(),next=node.nextElementSibling.getBoundingClientRect();return [Math.abs(box.left+box.width/2-previous.left-previous.width/2),Math.abs(box.left+box.width/2-next.left-next.width/2)];}),previewRatio:innerWidth>560?previewRect.width/columns[1]:null,rightDelta:innerWidth>560?Math.abs(previewRect.right-contextRect.right):null,borders:[borderWidths(card),borderWidths(preview),borderWidths(lineRoot.querySelector('[data-sc-root]'))],fits:document.documentElement.scrollWidth<=innerWidth});
}

document.activeElement?.blur();lineRoot.style.width='';const interaction={view_id:'role-line:interaction',state:'dev_in_progress',work_unit:{roles:['dev','cr'],summary:'完成',next_action:['任务总结后续']},role_details:{dev:{status:'running',next_action:'ROLE_NEXT_SHOULD_NOT_RENDER',subskills:[{name:'tech-select',status:'running',summary:'方案'},{name:'refactor-with-goal',status:'passed',summary:'完整历史记录'}]},cr:{status:'passed',next_action:'ROLE_NEXT_SHOULD_NOT_RENDER',subskills:[{name:'review-with-goal',summary:'审查记录'}]}}};
const interactionBefore=JSON.stringify(interaction);window.renderSurveyCorpsTaskView(lineRoot,interaction);
const roleSummary=role=>lineRoot.querySelector('[data-sc-role='+role+'] > summary'),owner=()=>lineRoot.querySelector('[data-sc-preview-link]:not([hidden])')?.closest('[data-sc-role]').dataset.scRole,geometry=()=>{const rect=lineRoot.querySelector('.sc-task-view').getBoundingClientRect();return [rect.width,rect.height];};
let lineInteraction=null;if(innerWidth>560){roleSummary('dev').focus();const baseline=geometry();roleSummary('cr').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));const hovered={owner:owner(),size:geometry(),focus:document.activeElement===roleSummary('dev')};roleSummary('cr').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}));const returned=owner();roleSummary('cr').focus();const focused={owner:owner(),size:geometry(),focus:document.activeElement===roleSummary('cr')};lineInteraction={baseline,hovered,returned,focused};}
const inlineNextAbsent=[...lineRoot.querySelectorAll('[data-sc-role] > [data-sc-detail-body] > section > h3')].every(node=>node.textContent!=='下一步');
const previewNextAbsent=!lineRoot.querySelector('[data-sc-preview-body]').textContent.includes('ROLE_NEXT_SHOULD_NOT_RENDER');
document.activeElement?.blur();interaction.state='completed';interaction.role_details.dev.status='passed';window.renderSurveyCorpsTaskView(lineRoot,interaction);
const summaryNextAbsent=![...lineRoot.querySelectorAll('[data-sc-preview-summary] h4')].some(node=>node.textContent==='下一步')&&!lineRoot.querySelector('[data-sc-preview-summary]').textContent.includes('任务总结后续')&&!lineRoot.querySelector('[data-sc-preview-size]').textContent.includes('任务总结后续');
const lineSummary={inlineNextAbsent,previewNextAbsent,summaryNextAbsent,authorityRetained:interactionBefore.includes('ROLE_NEXT_SHOULD_NOT_RENDER')&&interaction.role_details.dev.next_action==='ROLE_NEXT_SHOULD_NOT_RENDER'&&interaction.work_unit.next_action[0]==='任务总结后续',scrollWidth:document.documentElement.scrollWidth};
// QA summary-remove-next-action: omission is presentation-only for string and array inputs.
const summaryRemoval=[],summaryCases=[{name:'mixed-string',work:{summary:'保留结果',verified_scope:['保留验证'],unverified_scope:['保留未验证'],risks:['保留风险'],next_action:'SUMMARY_NEXT_STRING'}},{name:'mixed-array',work:{summary:'保留结果',verified_scope:['保留验证'],unverified_scope:['保留未验证'],risks:['保留风险'],next_action:['SUMMARY_NEXT_ARRAY_A','SUMMARY_NEXT_ARRAY_B']}},{name:'only-next-string',work:{next_action:'SUMMARY_NEXT_STRING'}},{name:'only-next-array',work:{next_action:['SUMMARY_NEXT_ARRAY_A','SUMMARY_NEXT_ARRAY_B']}},{name:'empty',work:{}}];
for(const item of summaryCases){
  document.activeElement?.blur();const input={view_id:'summary-removal:'+item.name,state:'completed',work_unit:{roles:['dev','cr'],...item.work},role_details:{dev:{status:'passed',summary:'开发摘要',next_action:'ROLE_NEXT_SHOULD_NOT_RENDER'},cr:{status:'passed',summary:'审查摘要'}}},before=JSON.stringify(input);window.renderSurveyCorpsTaskView(lineRoot,input);
  const summary=lineRoot.querySelector('[data-sc-preview-summary] .sc-task-view__summary-content'),reserve=lineRoot.querySelector('[data-sc-preview-size] .sc-task-view__summary-content'),sections=[...summary.querySelectorAll(':scope > section')],initial=geometry(),visible=summary.checkVisibility({visibilityProperty:true});let hover=null;
  if(innerWidth>560){roleSummary('dev').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));hover={owner:owner(),size:geometry()};roleSummary('dev').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body}));}
  roleSummary('dev').focus();const focused=geometry();roleSummary('dev').blur();
  summaryRemoval.push({name:item.name,unchanged:before===JSON.stringify(input),labels:sections.map(node=>node.querySelector('h4').textContent),values:sections.map(node=>[...node.querySelectorAll('p,li')].map(content=>content.textContent)),fallback:summary.querySelector(':scope > .sc-task-view__placeholder')?.textContent||null,nextAbsent:![...summary.querySelectorAll('h4')].some(node=>node.textContent==='下一步')&&!summary.textContent.includes('SUMMARY_NEXT_')&&!reserve.textContent.includes('SUMMARY_NEXT_'),copiesEqual:summary.outerHTML===reserve.outerHTML,initial,hover,focused,restored:geometry(),summaryVisible:visible&&summary.checkVisibility({visibilityProperty:true}),fits:document.documentElement.scrollWidth<=innerWidth});
}
lineRoot.remove();
// QA role detail partitions: visible geometry and natural-size copies share the same contract.
const layoutRoot=root.cloneNode(true);layoutRoot.removeAttribute('id');document.body.append(layoutRoot);const partitions=[];
for(const kind of ['short','empty','long']){
  document.activeElement?.blur();const text=kind==='long'?'长文内容 '.repeat(180):'短摘要',detail={status:'running',subskills:[{name:'tech-select',status:'running',summary:'SUBSKILL_BODY_SHOULD_NOT_RENDER'}]};if(kind!=='empty')Object.assign(detail,{summary:text,evidence:[kind==='long'?'A'.repeat(650):'必要证据'],risks:[kind==='long'?'风险内容 '.repeat(110):'风险']});
  const input={view_id:'partitions:'+kind,state:'dev_in_progress',work_unit:{roles:['req','dev','cr','qa'],summary:'任务结果',next_action:'任务下一步'},role_details:{req:{status:'passed',summary:'较长历史 '.repeat(40)},dev:detail,cr:{status:'passed'},qa:{status:'pending'}}},before=JSON.stringify(input);window.renderSurveyCorpsTaskView(layoutRoot,input);
  const card=layoutRoot.querySelector('[data-sc-role=dev]');if(innerWidth<=560)card.open=true;else card.querySelector(':scope > summary').focus();
  const body=innerWidth>560?layoutRoot.querySelector('[data-sc-preview-body] .sc-task-view__detail'):card.querySelector(':scope > [data-sc-detail-body]'),style=getComputedStyle(body),rect=body.getBoundingClientRect(),fields=[...body.querySelectorAll(':scope > section')],boxes=fields.map(node=>node.getBoundingClientRect());
  const dimensions=node=>{const style=getComputedStyle(node);return {display:style.display,columns:style.gridTemplateColumns,align:style.alignContent,rowGap:style.rowGap,columnGap:style.columnGap,padding:style.padding};};
  const reserve=innerWidth>560?layoutRoot.querySelector('[data-sc-preview-size]').children[1]:null;
  partitions.push({kind,unchanged:before===JSON.stringify(input),count:fields.length,headings:fields.map(node=>node.querySelector('h3').textContent),titleSizes:fields.map(node=>getComputedStyle(node.querySelector('h3')).fontSize),bodySize:style.fontSize,layout:dimensions(body),reserve:reserve?dimensions(reserve):null,boxes:boxes.map(box=>({x:box.left-rect.left,y:box.top-rect.top,width:box.width,height:box.height})),height:rect.height,centerTop:boxes[0].top-rect.top-parseFloat(style.paddingTop),centerBottom:rect.bottom-parseFloat(style.paddingBottom)-Math.max(...boxes.map(box=>box.bottom)),empty:fields.map(node=>{const content=node.querySelector('.sc-task-view__detail-content');return {text:content.textContent,height:content.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(content).lineHeight)};}),fits:body.scrollWidth<=body.clientWidth+1&&body.scrollHeight<=body.clientHeight+1&&document.documentElement.scrollWidth<=innerWidth,copyWidths:reserve?[...reserve.children].map(node=>node.getBoundingClientRect().width):null,pendingSections:layoutRoot.querySelector('[data-sc-role=qa] > [data-sc-detail-body]').childElementCount,noSubskillBody:!layoutRoot.textContent.includes('SUBSKILL_BODY_SHOULD_NOT_RENDER')});
}
document.activeElement?.blur();window.renderSurveyCorpsTaskView(layoutRoot,{state:'completed',work_unit:{roles:[],summary:'任务结果',next_action:'任务下一步'}});const summaryTypography={title:getComputedStyle(layoutRoot.querySelector('.sc-task-view__summary-title')).fontSize,heading:getComputedStyle(layoutRoot.querySelector('[data-sc-preview-summary] h4')).fontSize,body:getComputedStyle(layoutRoot.querySelector('[data-sc-preview-summary] p')).fontSize};layoutRoot.remove();
// QA role-fill-pulse: sample actual CSS animation frames without changing the shared clock contract.
const pulseRoot=root.cloneNode(true);pulseRoot.removeAttribute('id');document.body.append(pulseRoot);const pulseFrames=[],pulseStatics=[],pulseCanvas=document.createElement('canvas');pulseCanvas.width=pulseCanvas.height=1;const pulseContext=pulseCanvas.getContext('2d');
const pulseRgb=css=>{pulseContext.clearRect(0,0,1,1);pulseContext.fillStyle=css;pulseContext.fillRect(0,0,1,1);return [...pulseContext.getImageData(0,0,1,1).data].slice(0,3);};
const pulseInput=role=>{const input={view_id:'pulse:'+role,state:role==='qa'?'ready_for_qa':role==='cr'?'ready_for_cr':'dev_in_progress',work_unit:{roles:['req','dev','cr','qa']},role_details:{req:{status:'passed'},dev:{status:'passed'},cr:{status:'passed'},qa:{status:'pending'}}};input.role_details[role]={status:'running',subskills:[{name:{req:'align-with-visuals',dev:'tech-select',cr:'review-with-goal',qa:'test-with-goal'}[role],status:'passed',summary:'静态历史'}]};return input;};
const pulseObserve=card=>{const style=getComputedStyle(card);return {background:pulseRgb(style.backgroundColor),border:pulseRgb(style.borderTopColor),shadow:style.boxShadow};};
for(const role of ['req','dev','cr','qa']){
  const input=pulseInput(role),before=JSON.stringify(input);window.renderSurveyCorpsTaskView(pulseRoot,input);const card=pulseRoot.querySelector('[data-sc-role='+role+']'),animation=card.getAnimations().find(item=>item.animationName==='sc-running-pulse'),style=getComputedStyle(card);let low,high,end;
  if(animation){animation.pause();animation.currentTime=0;low=pulseObserve(card);animation.currentTime=900;high=pulseObserve(card);animation.currentTime=1800;end=pulseObserve(card);}else low=high=end=pulseObserve(card);
  pulseFrames.push({role,active:card.classList.contains('is-active'),unchanged:before===JSON.stringify(input),animation:style.animationName,duration:animation?.effect.getTiming().duration??null,base:pulseRgb(style.getPropertyValue('--panel-active')),text:pulseRgb(getComputedStyle(card.querySelector('.sc-task-view__role-name > span')).color),muted:pulseRgb(getComputedStyle(card.querySelector('.sc-task-view__role-subskill')).color),historyAnimation:getComputedStyle(card.querySelector('.sc-task-view__role-subskill')).animationName,low,high,end});
  input.state='blocked';window.renderSurveyCorpsTaskView(pulseRoot,input);const stopped=pulseRoot.querySelector('[data-sc-role='+role+']');pulseStatics.push({name:'stopped-'+role,active:stopped.classList.contains('is-active'),animation:getComputedStyle(stopped).animationName,background:pulseObserve(stopped).background,markers:stopped.querySelectorAll('.is-status-running').length});
}
for(const kind of ['invalid-status','conflicting-running','qa-before-cr']){const role=kind==='qa-before-cr'?'qa':'dev',input=pulseInput(role);if(kind==='invalid-status')input.role_details.dev.status='working';if(kind==='conflicting-running')input.role_details.cr.status='running';if(kind==='qa-before-cr')input.role_details.cr.status='pending';window.renderSurveyCorpsTaskView(pulseRoot,input);const card=pulseRoot.querySelector('[data-sc-role='+role+']');pulseStatics.push({name:kind,active:card.classList.contains('is-active'),animation:getComputedStyle(card).animationName,background:pulseObserve(card).background,markers:card.querySelectorAll('.is-status-running').length});}pulseRoot.remove();
const roleInputs={pending:'pending',not_started:'pending',running:'active',preparing:'active',in_progress:'active',working:'active',active:'active',started:'active',started_working:'active',completed:'completed',complete:'completed',done:'completed',success:'completed',successful:'completed',succeeded:'completed',passed:'passed',qa_passed:'passed',qa_success:'passed',workflow_ready:'passed',failed:'danger',blocked:'danger',paused:'waiting',cancelled:'pending',canceled:'pending',skipped:'pending',waiting:'waiting',waiting_user:'waiting',needs_user_confirm:'waiting',needs_revision:'revision',constructor:'unknown',['__proto__']:'unknown',toString:'unknown',unrecognized:'unknown'};
const canonicalRoleTones={pending:'pending',running:'active',passed:'passed',blocked:'danger',needs_user_confirm:'waiting'};
const roleTones=Object.fromEntries(Object.keys(roleInputs).map(status=>[status,Object.hasOwn(canonicalRoleTones,status)?canonicalRoleTones[status]:'unknown']));
const globalTones={confirmed:'completed',planned:'pending',dev_in_progress:'active',ready_for_cr:'waiting',cr_blocked:'danger',ready_for_qa:'waiting',qa_failed:'danger',qa_conditional:'revision',qa_passed:'passed',workflow_ready:'passed',completed:'completed',complete:'completed',done:'completed',success:'completed',successful:'completed',succeeded:'completed',failed:'danger',paused:'waiting',waiting:'waiting',cancelled:'pending',canceled:'pending',needs_user_confirm:'waiting',needs_revalidation:'revision',needs_revision:'revision',blocked:'danger'};
const sample=node=>({className:node.className,color:getComputedStyle(node).color,shimmer:node.classList.contains('is-status-running')});
const roleColors=Object.create(null),globalColors=Object.create(null),activeRoleMotion=Object.create(null);
for(const status of Object.keys(roleTones)){snapshot.role_details.qa={status,subskills:[{name:'test-with-goal',status,summary:'QA 记录'}]};window.renderSurveyCorpsTaskView(root,snapshot);roleColors[status]=sample(root.querySelector('[data-sc-role=qa] > summary .sc-task-view__role-state'));}
for(const state of Object.keys(globalTones)){snapshot.state=state;window.renderSurveyCorpsTaskView(root,snapshot);globalColors[state]=sample(root.querySelector('[data-sc-field=state]'));}
for(const status of ['running','preparing','in_progress','working','active','started','started_working']){snapshot.state='ready_for_qa';snapshot.role_details.qa={status,subskills:[{name:'test-with-goal',status:'running',summary:'QA 记录'}]};window.renderSurveyCorpsTaskView(root,snapshot);const role=root.querySelector('[data-sc-role=qa]'),roleStyles=getComputedStyle(role),state=role.querySelector(':scope > summary .sc-task-view__role-state'),skillState=role.querySelector(':scope > summary .sc-task-view__role-subskill');activeRoleMotion[status]={active:role.classList.contains('is-active'),animation:roleStyles.animationName,borderColor:roleStyles.borderTopColor,statusMarked:state.classList.contains('is-status-running'),statusAnimation:getComputedStyle(state).animationName,statusDuration:getComputedStyle(state).animationDuration,statusGradient:getComputedStyle(state).backgroundImage,subskillAnimation:getComputedStyle(skillState).animationName,subskillMarked:skillState.classList.contains('is-status-running')};}
snapshot.state='ready_for_qa';snapshot.role_details.qa={status:'running'};window.renderSurveyCorpsTaskView(root,snapshot,{debug:true});root.querySelector('[data-sc-play-animation]').click();
const connectors=[...root.querySelectorAll('.sc-task-view__connector')].map(node=>{const stem=getComputedStyle(node,'::before'),head=getComputedStyle(node,'::after');return {width:node.offsetWidth,height:node.offsetHeight,stemWidth:stem.width,stemHeight:stem.height,headTransform:head.transform,left:head.borderLeftWidth,right:head.borderRightWidth,top:head.borderTopWidth,bottom:head.borderBottomWidth,topColor:head.borderTopColor,leftColor:head.borderLeftColor,rightColor:head.borderRightColor,color:getComputedStyle(node).color,hidden:node.getAttribute('aria-hidden'),next:node.nextElementSibling.dataset.scRole,animation:getComputedStyle(node).animationName};});
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,view=root.querySelector('.sc-task-view'),active=root.querySelector('details.is-active');
const header=root.querySelector('.sc-task-view__header'),status=root.querySelector('[data-sc-field=state]'),headerRect=header.getBoundingClientRect(),statusRect=status.getBoundingClientRect();
const statusLayout={centerOffset:Math.abs((statusRect.left+statusRect.right)/2-(headerRect.left+headerRect.right)/2),fontSize:getComputedStyle(status).fontSize,eyebrowCount:root.querySelectorAll('.sc-task-view__root > .sc-task-view__muted').length,titleCount:root.querySelectorAll('h2').length};
const idle=root.querySelector('[data-sc-role=req]');const result={roleLines,listHeights,pulseFrames,pulseStatics,lineInteraction,lineSummary,summaryRemoval,partitions,summaryTypography,roleTones,globalTones,roleColors,globalColors,activeRoleMotion,connectors,statusLayout,reduced,viewAnimation:getComputedStyle(view).animationName,activeAnimation:getComputedStyle(active,'::before').animationName,idleAnimation:getComputedStyle(idle,'::before').animationName,replay:active.classList.contains('is-manual-replay'),viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};parent.postMessage({scVisualResult:result},'*');
</script></body></html>`;

function readChromeResult(pagePath, profilePath, width, reduced = false) {
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${profilePath}`, `--window-size=${Math.max(width,600)},900`, "--virtual-time-budget=2000", "--dump-dom"];
  if (reduced) args.push("--force-prefers-reduced-motion");
  args.push(new URL(`file:///${pagePath.replaceAll("\\", "/")}`).href);
  const run = spawnSync(chrome, args, { encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 0, run.stderr || "Chrome visual-state test failed");
  const encoded = run.stdout.match(/data-sc-test-result="([^"]+)"/)?.[1];
  assert.ok(encoded, "Chrome did not emit the visual-state result");
  return JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
}

try {
  fs.writeFileSync(page, harness, "utf8");
  const run = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${profile}`, "--window-size=360,900", "--dump-dom", new URL(`file:///${page.replaceAll("\\", "/")}`).href], { encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 0, run.stderr || "Chrome behavior test failed");
  const encoded = run.stdout.match(/data-sc-test-result="([^"]+)"/)?.[1];
  assert.ok(encoded, "Chrome did not emit the SC behavior result");
  const result = JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  for(const [scenario,preserved] of Object.entries(result.focus)) assert.equal(preserved,true,scenario+' must retain valid same-task focus without stealing focus for removed, hidden or unrelated controls');
  for(const [state,observed] of Object.entries(result.lifecycle.stops)) {
    assert.deepEqual(observed.active,[],state+' must suppress stale running activity');
    assert.deepEqual(observed.current,[],state+' must remove the active accessibility marker');
  }
  for(const [state,observed] of Object.entries(result.lifecycle.repairs)) assert.deepEqual(observed.active,['dev'],state+' must retain explicit repair activity');
  for(const [key,value] of Object.entries(result.lifecycle.phases)){const [state,status]=key.split(':');assert.equal(value.label,state==='ready_for_cr'?'审查阶段':'测试阶段');assert.deepEqual(value.active,status==='running'?[state==='ready_for_cr'?'cr':'qa']:[],key+' must expose only the actual executing owner');}
  for(const [key,value] of Object.entries(result.lifecycle.qaGate)) assert.deepEqual(value,{active:[],open:[],current:[],animation:'none'},key+' must keep QA inert until selected CR has exactly passed');
  assert.deepEqual(result.lifecycle.sameView.open,['req'],'same task must preserve a valid manual selection');
  assert.deepEqual(result.lifecycle.manuallyClosed.open,[],'same task must preserve manually collapsed cards');
  for(const field of ['newView','removedSelection','resumed']) assert.deepEqual(result.lifecycle[field].open,['dev'],field+' must open the current active role');
  assert.deepEqual(result.lifecycle.paused,{active:[],open:[],current:[]},'pausing must clear activity and automatic expansion');
  assert.equal(result.lifecycle.unchanged,true,'rendering must not mutate the authoritative snapshot');
  assert.deepEqual(result.boundaries.map(item=>[item.roles,item.active,item.open]), [[[],[],[]],[[],[],[]],[['dev','cr'],['dev'],['dev']],[['qa','dev'],[],[]]], "excluded roles must not affect activity or expansion");
  assert.deepEqual(result.excludedFallback.active, [], "global state cannot activate an excluded role");
  assert.ok(result.invalidStates.every(state=>state==='未知状态'), "malformed state values must render safely");
  assert.deepEqual(result.emptyView.roles, [], "empty snapshots must not invent participants");
  assert.deepEqual(result.recovered.active, ['cr'], "valid updates must recover after malformed input");
  assert.deepEqual(result.flow, { roles: ["req", "dev", "cr", "qa"], titles: ["REQ", "DEV", "CR", "QA"], lastRole: "qa", extraExitNodes: 0, exitTextCount: 0, connectorCount: 3, firstNode: "req" }, "role connectors must begin between the first and second role");
  assert.equal(result.defaults.connectorGeometry.length, 3, "only transitions between role cards must have connectors");
  assert.ok(result.defaults.connectorGeometry.every(({before,after,headTop})=>before!=="none"&&after!=="none"&&parseFloat(headTop)>0), "connectors must expose a visible stem and solid downward arrowhead in the browser");
  const {connectorGeometry,...defaultValues}=result.defaults;
  assert.deepEqual(defaultValues, { summary: "", summaryDom:0, bottomSummary:0, selected: "REQ → DEV → CR → QA", contextRemoved: true, namesRemoved: true, projectMcpsHidden: true, debugHidden: true, autoMotion: false, previewHeaders:0, frameBorders:{context:"2px",preview:"2px",role:"2px",roleDivider:"2px",previewDivider:"0px"} }, "task frames keep 2px borders and the preview has no header or top content divider");
  assert.deepEqual(result.debugTrue, { hidden: false, replay: true }, "strict debug true must expose and enable replay");
  for (const mode of [result.debugString, result.debugDefault, result.debugFalse, result.debugInSnapshot]) assert.deepEqual(mode, { hidden: true, replay: false }, "only options.debug true may enable replay; nondebug programmatic clicks must not replay");
  assert.equal(result.provided.headerText.includes("SURVEY CORPS"), false, "header must omit the removed metadata row");
  assert.equal(result.provided.headerText.includes("kyojin"), false, "project metadata must not render in the header");
  assert.equal(result.provided.headerText.includes("sc-task-view:"), false, "view identifiers must not render in the header");
  assert.equal(result.provided.taskType, "界面调整");
  assert.equal(result.provided.selected, "DEV → QA", "selection must come from the orchestrator rather than all cards");
  assert.deepEqual(result.provided.metrics,{taskElapsed:"1天 01小时 01分 01秒",devElapsed:"1分 05秒",tokenNodes:0,tokenText:false,roleMetricCount:1},"elapsed time must retain units while legacy token data stays absent from the UI");
  assert.deepEqual(result.invalidMetrics,["",""],"negative and fractional elapsed time must remain blank");
  assert.deepEqual(result.missingMetrics,["",""],"legacy snapshots without elapsed time must remain blank");
  const missingDataExpected={zero:["0"],false:["false"],literal:["未提供"],malicious:[result.payload],absent:[],undefined:[],null:[],"empty-string":[],"empty-array":[],mixed:["0","false","未提供",result.payload]};
  assert.deepEqual(result.missingData.map(item=>item.name),Object.keys(missingDataExpected),"all missing-data boundary scenarios must execute");
  for(const item of result.missingData){
    const items=missingDataExpected[item.name],metadata=["zero","false","literal","malicious"].includes(item.name)?items[0]:"";
    assert.deepEqual(item.metadata,[metadata,metadata,metadata],item.name+" must preserve supplied metadata and clear absent values");
    assert.deepEqual(item.headings,["摘要","必要证据","风险"],item.name+" retains the three role headings without next action");
    assert.deepEqual(item.contents,Array.from({length:3},()=>({text:items.join(""),items,children:items.length?1:0})),item.name+" must suppress empty bullets while preserving supplied text");
    assert.equal(item.injectedElements,0,item.name+" must use textContent instead of interpreting HTML");
    assert.equal(item.executed,false,item.name+" must not execute supplied HTML");
  }
  assert.deepEqual(result.missingStateLabels,Array.from({length:3},()=>({role:"状态未提供",subskill:"tech-select"})),"missing role states keep semantic labels while valid historical names remain");
  assert.deepEqual(result.elapsedBoundaries,["0毫秒","1毫秒","999毫秒","1秒"],"subsecond elapsed values must preserve measured precision");
  assert.deepEqual(result.provided.projectMcps, { hidden:false, open:false, count:"(2)", names:["codegraph","filesystem"] }, "project MCPs must be deduplicated, default-collapsed and rendered safely from the snapshot");
  assert.equal(result.provided.reason, "仅实现和验收；此说明专门用于验证长文本始终在元数据值列内自然换行，且不会挤占左侧标签列。");
  assert.equal(result.provided.metadataLayout.className, "sc-task-view__metadata");
  assert.match(result.provided.metadataLayout.gridTemplateColumns, /^78px /, "metadata must reserve a stable first column for labels");
  assert.equal(result.provided.metadataLayout.alignItems, "baseline");
  assert.equal(result.provided.metadataLayout.labelTextAlign, "right");
  assert.ok(result.provided.metadataLayout.labelValueTopDelta<=1, "metadata labels and values must align on their first baseline");
  assert.equal(result.provided.metadataLayout.valueStartsAfterLabel, true);
  assert.equal(result.provided.metadataLayout.reasonWraps, true, "long metadata must wrap in the value column");
  assert.equal(result.provided.metadataLayout.reasonFits, true, "long metadata must not overflow the value column");
  assert.equal(result.provided.summaryTitle,"任务总结","the summary title must render inside its content");
  assert.equal(result.provided.summary, result.payload, "task summary must preserve supplied text safely");
  assert.equal(result.provided.summaryInsideAside, true); assert.equal(result.provided.visibleSummaryCount,1,"terminal summary must be unique in the same aside");
  assert.equal(result.provided.summaryAfterQA, true);
  assert.equal(result.provided.roleCount, 2, "task summary must not create an extra flow card");
  assert.equal(result.provided.contextRemoved, true);
  assert.equal(result.provided.namesRemoved, true);
  assert.equal(result.provided.injectedElements, 0, "task summary and project MCPs must not inject HTML");
  assert.deepEqual(result.removed, { headerText: "已完成", contextRemoved: true, namesRemoved: true, projectMcpsHidden: true, summary: "暂无总结", summaryClass: "sc-task-view__placeholder" }, "removed metadata and absent project MCPs must stay hidden while optional values update");
  assert.deepEqual(result.roleStatuses, result.roleCases, "all supported role statuses must display Chinese");
  assert.notEqual(result.roleStatusClasses.running, result.roleStatusClasses.passed, "running and completed roles must use different semantic color classes");
  assert.notEqual(result.roleStatusClasses.passed, result.roleStatusClasses.blocked, "completed and failed roles must use different semantic color classes");
  assert.deepEqual(result.globalStatuses, result.globalCases, "all supported global statuses must display Chinese without codes");
  assert.notEqual(result.globalStatusClasses.qa_passed, result.globalStatusClasses.qa_failed, "passed and failed workflow states must use different semantic color classes");
  assert.deepEqual(result.unknown, { global: "未知状态", role: "未知状态", img: 0 }, "unknown statuses must use a safe Chinese fallback");
  assert.deepEqual(result.prototypeFallbacks, ["未知状态", "未知状态", "未知状态"], "prototype property names must not bypass the unknown-status fallback");
  assert.deepEqual(result.pendingBodies,["req","dev","cr","qa"].map(role=>({role,text:"",children:0,controls:0})),"pending bodies suppress supplied fields, metrics, subskills and controls");
  assert.deepEqual(result.initial, ["cr"], "initial render must open the resolved CR role");
  assert.deepEqual(result.sameSnapshot, ["req"], "same snapshot must preserve the user's REQ selection");
  assert.deepEqual(result.changedActive, ["qa"], "changed active role must switch the open card to QA");
  assert.deepEqual(result.afterReplay, ["qa"], "animation replay must not change the accordion");
  assert.equal(result.stateAfter, result.stateBefore, "animation replay must not change task state");
  assert.ok(result.initialToggleListeners>0, "initial render must bind the native detail handlers");
  assert.equal(result.activeToggleListeners, result.initialToggleListeners, "rerender must retain the initial toggle listener count without duplicate bindings");
  assert.deepEqual(result.progress, {req:false,dev:false,cr:false,qa:false}, "role cards must not render progress bars or percentages");
  assert.deepEqual(result.waitingActive, [], "waiting workflow states must not mark a role as actively animating");
  assert.deepEqual(result.finishedDevActive, [], "a completed DEV status must suppress a stale global in-progress fallback");
  const toneColors={pending:"rgb(149, 163, 181)",active:"rgb(70, 184, 238)",completed:"rgb(39, 201, 176)",passed:"rgb(75, 216, 130)",danger:"rgb(237, 117, 137)",waiting:"rgb(233, 200, 92)",revision:"rgb(236, 155, 79)",unknown:"rgb(255, 255, 255)"};
  for(const mode of [{width:360,reduced:false},{width:960,reduced:false},{width:360,reduced:true}]) {
    const srcdoc=visualHarness.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    // A fixed iframe viewport avoids Chrome's desktop-window minimum width.
    const wrapper=`<!doctype html><html><body><script>window.addEventListener('message',event=>{if(event.source===document.querySelector('iframe').contentWindow&&event.data.scVisualResult)document.body.dataset.scTestResult=JSON.stringify(event.data.scVisualResult)});</script><iframe style="border:0;width:${mode.width}px;height:900px" srcdoc="${srcdoc}"></iframe></body></html>`;
    fs.writeFileSync(page,wrapper,"utf8");
    const observed=readChromeResult(page,path.join(temp,`visual-${mode.width}-${mode.reduced}`),mode.width,mode.reduced);
    assert.equal(observed.viewport,mode.width,"responsive cases must run at the exact requested iframe viewport");
    assert.equal(observed.roleLines.length,roleLineCases.length,"all subskill-name cases execute at each viewport");
    for(const [index,item] of observed.roleLines.entries()){
      const expected=roleLineCases[index];assert.equal(item.name,expected.name);
      const expectedTexts=expected.texts.length?expected.texts:[""];assert.deepEqual(item.lines.map(line=>line.text),expectedTexts,item.name+" preserves unique valid names in first occurrence order");assert.equal(item.count,expectedTexts.length,item.name+" renders each unique valid name or one blank row");
      assert.equal(item.removedUI,0,item.name+" has no subskill area in inline, preview or size copies");assert.equal(item.controls,0,item.name+" details contain only task fields");assert.equal(item.active,expected.active,item.name+" uses the existing role activity gate");
      assert.equal(item.unchanged,true,item.name+" keeps authoritative snapshots unchanged");
      for(const [lineIndex,line] of item.lines.entries()){
        const running=lineIndex===expected.runningIndex;assert.equal(line.title,expectedTexts[lineIndex],item.name+" exposes each full tooltip");assert.equal(line.children,0,item.name+" keeps safe text");assert.equal(line.below,true,item.name+" stacks rows below status or the preceding row");assert.ok(line.height>0&&line.height<=line.lineHeight+1,item.name+" reserves one line per record even when blank");
        assert.equal(line.whiteSpace,"nowrap");assert.equal(line.overflow,"hidden");assert.equal(line.textOverflow,"ellipsis");assert.equal(line.shimmer,running,item.name+" marks only the final valid running record");assert.equal(line.animation,running&&!mode.reduced?"sc-status-shimmer":"none",item.name+" respects activity gates and reduced motion");
        if(running&&!mode.reduced){assert.equal(line.color,"rgba(0, 0, 0, 0)");for(const color of ["rgb(155, 168, 184)","rgb(232, 237, 243)","rgb(255, 255, 255)"])assert.ok(line.gradient.includes(color),item.name+" uses neutral name shimmer colors");for(const color of ["rgb(70, 184, 238)","rgb(185, 226, 255)"])assert.ok(!line.gradient.includes(color),item.name+" avoids status blue in names");}
        else{assert.equal(line.color,"rgb(155, 168, 184)",item.name+" keeps the default muted name color");assert.equal(line.gradient,"none");}assert.equal(line.fits,true,item.name+" keeps each row inside the role card");
      }
      assert.equal(item.nextAbsent,true,item.name+" suppresses role next-action text");
      assert.deepEqual(item.headings,expected.status==="pending"?[]:["摘要","必要证据","风险"],item.name+" removes next action without suppressing other fields");
      if(expected.name==="long-name"&&mode.width===960)assert.equal(item.lines[0].clipped,true,"the longest allowed DEV name exercises real clipping in the desktop role lane");
    }
    const pulseAccents={req:[189,155,234],dev:[75,216,130],cr:[233,200,92],qa:[237,117,137]},pulseDistance=(left,right)=>Math.hypot(...left.map((value,index)=>value-right[index])),pulseLuminance=rgb=>rgb.map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0),pulseContrast=(text,background)=>(pulseLuminance(text)+.05)/(pulseLuminance(background)+.05);
    assert.deepEqual(observed.pulseFrames.map(item=>item.role),["req","dev","cr","qa"]);
    for(const item of observed.pulseFrames){assert.equal(item.active,true);assert.equal(item.unchanged,true);assert.deepEqual(item.base,[16,25,35]);assert.deepEqual(item.low.border,pulseAccents[item.role]);assert.deepEqual(item.high.border,item.low.border);assert.deepEqual(item.end.background,item.low.background);assert.equal(item.historyAnimation,"none");
      if(mode.reduced){assert.equal(item.animation,"none");assert.equal(item.duration,null);assert.deepEqual(item.low.background,item.base);assert.deepEqual(item.high.background,item.base);}
      else{assert.equal(item.animation,"sc-running-pulse");assert.equal(item.duration,1800);for(const [frame,weight] of [[item.low,.03],[item.high,.08]])for(const [index,value] of frame.background.entries())assert.ok(Math.abs(value-(item.base[index]*(1-weight)+pulseAccents[item.role][index]*weight))<=1,item.role+" uses the approved faint character tint");assert.ok(pulseDistance(item.low.background,item.high.background)>0,item.role+" has a visible low/high fill change");assert.ok(pulseDistance(item.high.background,item.base)<pulseDistance(item.high.border,item.base)*.12,item.role+" fill stays substantially weaker than its border");assert.notEqual(item.low.shadow,item.high.shadow,"fill retains the existing border glow cycle");}
      for(const frame of [item.low,item.high]){assert.ok(pulseContrast(item.text,frame.background)>=7,item.role+" role label remains readable");assert.ok(pulseContrast(item.muted,frame.background)>=4.5,item.role+" historical names remain readable");}
    }
    assert.deepEqual(observed.pulseStatics.map(item=>item.name),["stopped-req","stopped-dev","stopped-cr","stopped-qa","invalid-status","conflicting-running","qa-before-cr"]);for(const item of observed.pulseStatics){assert.equal(item.active,false);assert.equal(item.animation,"none",item.name+" has no card pulse");assert.deepEqual(item.background,[13,18,25],item.name+" returns to the readable static panel");assert.equal(item.markers,0);}
    const heightNames={zero:[""],one:["tech-select"],three:["tech-select","refactor-with-goal","bug-fix"],five:["tech-select","refactor-with-goal","bug-fix","bug-cause","optimize"],duplicates:["tech-select","refactor-with-goal","bug-fix","bug-cause","optimize"],"shrink-one":["tech-select"],"remove-all":[""],reorder:["optimize","refactor-with-goal","tech-select"],"nonarray-update":[""]};
    assert.deepEqual(observed.listHeights.map(item=>item.key),Object.keys(heightNames));
    for(const item of observed.listHeights){assert.deepEqual(item.names,heightNames[item.key],item.key+" replaces the entire current list in order");assert.equal(item.unchanged,true);assert.equal(item.fits,true);assert.deepEqual(item.borders,Array.from({length:3},()=>["2px","2px","2px","2px"]));for(const centers of item.arrowCenters)assert.ok(centers.every(delta=>delta<=1),item.key+" keeps vertical arrows centered between role cards");if(mode.width>560){assert.ok(item.linkCenter<=1.1,item.key+" keeps the ownership line centered on a variable-height summary");assert.ok(Math.abs(item.previewRatio-.9)<=.005);assert.ok(item.rightDelta<=1);for(const size of Object.values(item.interaction))assert.deepEqual(size,item.initial,item.key+" hover/focus preserves the view dimensions");}else{assert.equal(item.interaction,null);assert.equal(item.linkCenter,null);}}
    const heights=Object.fromEntries(observed.listHeights.map(item=>[item.key,item.summaryHeight]));assert.ok(heights.one>=heights.zero-1);assert.ok(heights.three>heights.one+1,"three records grow the role header naturally");assert.ok(heights.five>heights.three+1,"five unique names continue to grow the header");assert.ok(Math.abs(heights.duplicates-heights.five)<=1,"duplicate names do not increase role header height");assert.ok(Math.abs(heights["shrink-one"]-heights.one)<=1);assert.ok(Math.abs(heights["remove-all"]-heights.zero)<=1);assert.ok(Math.abs(heights["nonarray-update"]-heights.zero)<=1,"invalid updates do not cache prior history");
    assert.deepEqual({...observed.lineSummary,scrollWidth:undefined},{inlineNextAbsent:true,previewNextAbsent:true,summaryNextAbsent:true,authorityRetained:true,scrollWidth:undefined},"role and task-summary next actions disappear while authoritative next-action data remains");
    assert.ok(observed.lineSummary.scrollWidth<=mode.width,"name lines and summary must not cause horizontal overflow");
    assert.deepEqual(observed.summaryRemoval.map(item=>item.name),["mixed-string","mixed-array","only-next-string","only-next-array","empty"]);
    for(const item of observed.summaryRemoval){
      assert.equal(item.unchanged,true,item.name+" retains authoritative next actions");assert.equal(item.nextAbsent,true,item.name+" omits next-action title and values in visible and reserve summaries");assert.equal(item.copiesEqual,true,item.name+" keeps visible and natural-size summary content identical");assert.equal(item.summaryVisible,true);assert.equal(item.fits,true);
      if(item.name.startsWith("mixed-")){assert.deepEqual(item.labels,["结果","已验证","注意事项"]);assert.deepEqual(item.values,[["保留结果"],["保留验证"],["未验证：保留未验证","风险：保留风险"]]);assert.equal(item.fallback,null);}
      else{assert.deepEqual(item.labels,[]);assert.deepEqual(item.values,[]);assert.equal(item.fallback,"暂无总结",item.name+" preserves the existing empty-summary fallback");}
      assert.deepEqual(item.focused,item.initial,item.name+" focus does not resize the view");assert.deepEqual(item.restored,item.initial,item.name+" returning to the summary does not resize the view");if(mode.width>560){assert.equal(item.hover.owner,"dev");assert.deepEqual(item.hover.size,item.initial,item.name+" summary/role hover switches retain view size");}else assert.equal(item.hover,null);
    }
    if(mode.width>560){const item=observed.lineInteraction;assert.equal(item.hovered.owner,"cr");assert.equal(item.hovered.focus,true);assert.deepEqual(item.hovered.size,item.baseline,"hover must not resize the task view");assert.equal(item.returned,"dev");assert.equal(item.focused.owner,"cr");assert.equal(item.focused.focus,true);assert.deepEqual(item.focused.size,item.baseline,"keyboard role switch must not resize the task view");}
    else assert.equal(observed.lineInteraction,null,"narrow cards retain their inline detail interaction");
    assert.deepEqual(observed.partitions.map(item=>item.kind),["short","empty","long"]);
    for(const item of observed.partitions){
      assert.equal(item.unchanged,true);assert.equal(item.count,3);assert.deepEqual(item.headings,["摘要","必要证据","风险"]);assert.deepEqual(item.titleSizes,["13px","13px","13px"]);assert.equal(item.bodySize,"13px");assert.equal(item.pendingSections,0);assert.equal(item.noSubskillBody,true);assert.equal(item.fits,true,item.kind+" content grows naturally without overflow");
      const [summary,evidence,risk]=item.boxes;
      if(mode.width>560){assert.deepEqual(item.layout,item.reserve,"visible and size copies use identical grid metrics");assert.equal(item.layout.display,"grid");assert.equal(item.layout.align,"center");assert.equal(item.layout.rowGap,"24px");assert.equal(item.layout.columnGap,"24px");assert.equal(item.layout.padding,"20px 12px");for(const box of [evidence,risk]){assert.ok(Math.abs(summary.x-box.x)<=1,"desktop fields share one left edge");assert.ok(Math.abs(summary.width-box.width)<=1,"desktop fields share one column width");}assert.ok(Math.abs(evidence.y-summary.y-summary.height-24)<=1,"evidence follows summary with the approved gap");assert.ok(Math.abs(risk.y-evidence.y-evidence.height-24)<=1,"risk follows evidence with the approved gap");assert.ok(Math.abs(item.centerTop-item.centerBottom)<=1,item.kind+" centers the complete field group vertically");for(const [index,box] of item.boxes.entries())assert.ok(Math.abs(box.width-item.copyWidths[index])<=1,"reserve fields retain visible field widths");if(item.kind==="short")assert.ok(item.centerTop>8,"short content exercises real spare vertical space");}
      else{assert.equal(item.layout.display,"block");assert.equal(item.reserve,null);assert.ok(Math.abs(summary.x-evidence.x)<=1&&Math.abs(summary.x-risk.x)<=1);assert.ok(evidence.y>=summary.y+summary.height&&risk.y>=evidence.y+evidence.height,"narrow fields form one natural column");}
      if(item.kind==="empty")for(const field of item.empty){assert.equal(field.text,"");assert.ok(field.height>=field.lineHeight-1,"empty fields reserve a blank content line");}
    }
    assert.ok(observed.partitions[2].height>observed.partitions[0].height,"long text expands the detail instead of clipping");assert.deepEqual(observed.summaryTypography,{title:"13px",heading:"11px",body:"13px"},"role title changes do not change task-summary typography");
    assert.ok(observed.statusLayout.centerOffset<=1,"global status must remain centered in the header");
    assert.equal(observed.statusLayout.fontSize,"18px","global status must use enlarged type");
    assert.equal(observed.statusLayout.eyebrowCount,0,"work unit eyebrow must not render");
    assert.equal(observed.statusLayout.titleCount,0,"the redundant task-flow title must not render");
    assert.ok(Object.hasOwn(observed.roleColors,"__proto__"),"prototype-name role color cases must execute");
    for(const [status,tone] of Object.entries(observed.roleTones)) {
      for(const item of [observed.roleColors[status]]) {
        assert.ok(item.className.includes(`sc-task-view__state--${tone}`), `${status} must carry the ${tone} semantic class`);
        assert.equal(item.color,status==="running"&&!mode.reduced?"rgba(0, 0, 0, 0)":toneColors[tone],`${status} must retain its semantic color or running text gradient`);
        assert.equal(item.shimmer,status==="running",`${status} must shimmer only for the valid running role`);
      }
    }
    for(const [state,tone] of Object.entries(observed.globalTones)) assert.equal(observed.globalColors[state].color,toneColors[tone],`${state} must render the ${tone} workflow color`);
    assert.deepEqual(observed.connectors.map(item=>item.next),["dev","cr","qa"],"downward connectors must connect adjacent roles and omit the task-context arrow");
    for(const item of observed.connectors) {
      assert.ok(item.width>=8&&item.height>=22,"arrowheads must fit inside visible connectors");
      assert.equal(item.stemWidth,"2px");assert.ok(parseFloat(item.stemHeight)>0);
      assert.equal(item.left,"4px");assert.equal(item.right,"4px");assert.equal(item.top,"7px");assert.equal(item.bottom,"0px");
      assert.equal(item.topColor,item.color);assert.equal(item.leftColor,"rgba(0, 0, 0, 0)");assert.equal(item.rightColor,"rgba(0, 0, 0, 0)");
      assert.equal(item.headTransform,"matrix(1, 0, 0, 1, -4, 0)","the larger solid arrowhead must remain centered on its vertical stem without rotation");
      assert.equal(item.hidden,"true","decorative arrows must remain hidden from assistive technologies");
      assert.equal(item.animation,"none","workflow connectors must not animate automatically");
    }
    assert.equal(observed.reduced,mode.reduced,"reduced-motion test must use the intended browser preference");
    assert.equal(observed.replay,!mode.reduced,"manual replay must respect reduced motion");
    assert.equal(observed.viewAnimation,"none","opening a task view must not animate when no role is actively working");
    for(const [status,motion] of Object.entries(observed.activeRoleMotion)) {
      assert.equal(motion.active,status === "running",`${status} activity must require exact running`);
      assert.equal(motion.statusMarked,status === "running");
      assert.equal(motion.statusAnimation,!mode.reduced&&status==="running"?"sc-status-shimmer":"none");
      if(!mode.reduced&&status==="running"){assert.equal(motion.statusDuration,"1.8s","left-card shimmer retains the shared effect period");for(const color of ["rgb(70, 184, 238)","rgb(185, 226, 255)","rgb(255, 255, 255)"])assert.ok(motion.statusGradient.includes(color),"running status retains its original blue shimmer");}
      assert.equal(motion.subskillAnimation,!mode.reduced&&status==="running"?"sc-status-shimmer":"none","left-name shimmer obeys the role activity gate");
      assert.equal(motion.subskillMarked,status==="running");
      if(status === "running") assert.equal(motion.borderColor,toneColors.danger,`${status} QA must use its character accent on the border`);
      assert.equal(motion.animation,mode.reduced || status !== "running"?"none":"sc-running-pulse",`${status} must ${mode.reduced?"disable":"retain"} its persistent running animation`);
    }
    assert.equal(observed.activeAnimation,"none","role cards must not render a rotating geometric border");
    assert.equal(observed.idleAnimation,"none","idle role borders must remain static");
    assert.ok(observed.scrollWidth<=observed.viewport,"role states and arrow connectors must not cause horizontal overflow");
  }
  console.log("SC task view Chrome behavior regression passed.");
} finally {
  console.log('Browser evidence retained: '+temp);
}
