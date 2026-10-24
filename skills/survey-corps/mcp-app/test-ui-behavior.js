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
const focusRole=()=>stateRoot.querySelector('[data-sc-role=dev] > summary'),focusSkill=()=>stateRoot.querySelector('[data-sc-subskill=tech-select] > summary');
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focusRole().focus();focus.initial=document.activeElement===focusRole();
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focus.role=document.activeElement===focusRole();
focusSkill().focus();focus.skillInitial=document.activeElement===focusSkill();
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focus.skill=document.activeElement===focusSkill();
focusSnapshot.role_details.dev.subskills.push({name:'tech-select',summary:'第二轮方案记录'});window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);
stateRoot.querySelectorAll('[data-sc-subskill=tech-select] > summary')[1].focus();window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focus.repeatedSkill=document.activeElement===stateRoot.querySelectorAll('[data-sc-subskill=tech-select] > summary')[1];
focusSnapshot.role_details.dev.subskills.pop();
window.renderSurveyCorpsTaskView(stateRoot,{...focusSnapshot,role_details:{dev:{status:'running'}}});focus.removedSkill=document.activeElement===focusRole();
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focusSkill().focus();
window.renderSurveyCorpsTaskView(stateRoot,{...focusSnapshot,state:'paused'});focus.hiddenSkill=document.activeElement===focusRole();
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focusRole().focus();
window.renderSurveyCorpsTaskView(stateRoot,{...focusSnapshot,work_unit:{roles:[]}});focus.removedRole=!stateRoot.contains(document.activeElement);
window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focusRole().focus();
window.renderSurveyCorpsTaskView(stateRoot,{...focusSnapshot,view_id:'focus:new-task'});focus.newTask=!stateRoot.contains(document.activeElement);
const outside=document.createElement('button');document.body.append(outside);outside.focus();window.renderSurveyCorpsTaskView(stateRoot,focusSnapshot);focus.outside=document.activeElement===outside;outside.remove();
stateRoot.remove();
window.renderSurveyCorpsTaskView(root,snapshot);
const initialToggleListeners=toggleAdds-toggleRemoves;
const initial=openRoles(),progress={req:hasProgress("req"),dev:hasProgress("dev"),cr:hasProgress("cr"),qa:hasProgress("qa")};
const waitingSnapshot=structuredClone(snapshot);waitingSnapshot.state="ready_for_qa";waitingSnapshot.role_details={req:{status:"passed"},dev:{status:"passed"},cr:{status:"pending"},qa:{status:"pending"}};window.renderSurveyCorpsTaskView(root,waitingSnapshot);const waitingActive=[...root.querySelectorAll('details[data-sc-role].is-active')].map(node=>node.dataset.scRole);window.renderSurveyCorpsTaskView(root,snapshot);
const finishedDev=structuredClone(waitingSnapshot);finishedDev.state="dev_in_progress";window.renderSurveyCorpsTaskView(root,finishedDev);const finishedDevActive=[...root.querySelectorAll('details[data-sc-role].is-active')].map(node=>node.dataset.scRole);window.renderSurveyCorpsTaskView(root,snapshot);
const flow={roles:[...root.querySelectorAll("details[data-sc-role]")].map(node=>node.dataset.scRole),titles:[...root.querySelectorAll("details[data-sc-role] summary .sc-task-view__role-name > span:first-child")].map(node=>node.textContent),lastRole:root.querySelector("[data-sc-roles]").lastElementChild?.dataset.scRole,extraExitNodes:root.querySelectorAll("[data-sc-exit], .sc-task-view__exit").length,exitTextCount:root.querySelector("[data-sc-roles]").textContent.split("任务出口").length-1,connectorCount:root.querySelectorAll("[data-sc-connector], .sc-task-view__connector").length,firstNode:root.querySelector("[data-sc-roles]").firstElementChild?.dataset.scRole};
const frameBorders={context:getComputedStyle(root.querySelector('[data-sc-root]')),preview:getComputedStyle(root.querySelector('[data-sc-role-preview]')),role:getComputedStyle(root.querySelector('[data-sc-role=cr]')),roleDivider:getComputedStyle(root.querySelector('[data-sc-role=cr] .sc-task-view__role-name')),previewDivider:getComputedStyle(root.querySelector('.sc-task-view__preview-heading'))};
const defaults={summary:root.querySelector('[data-sc-preview-summary]').textContent,summaryDom:root.querySelector('[data-sc-preview-summary]').childElementCount,bottomSummary:root.querySelectorAll('[data-sc-task-summary],.sc-task-view__task-summary').length,selected:root.querySelector('[data-sc-selected-roles]').textContent,contextRemoved:!root.querySelector('[data-sc-context]'),namesRemoved:!root.querySelector('[data-sc-agent-name]'),projectMcpsHidden:root.querySelector('[data-sc-project-mcps]').hidden,debugHidden:root.querySelector('[data-sc-play-animation]').hidden,autoMotion:root.querySelector('.sc-task-view').classList.contains('is-entering'),frameBorders:{context:frameBorders.context.borderTopWidth,preview:frameBorders.preview.borderTopWidth,role:frameBorders.role.borderTopWidth,roleDivider:frameBorders.roleDivider.borderRightWidth,previewDivider:frameBorders.previewDivider.borderBottomWidth},connectorGeometry:[...root.querySelectorAll('.sc-task-view__connector')].map(node=>({before:getComputedStyle(node,"::before").content,after:getComputedStyle(node,"::after").content,headTop:getComputedStyle(node,"::after").borderTopWidth}))};
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
supplied.role_details.req.agent_name='req-agent';supplied.role_details.dev={agent_name:'dev-agent',metrics:{elapsed_ms:65000,total_tokens:2345}};supplied.role_details.cr.agent_name='cr-agent';
supplied.role_details.qa.agent_name=payload;
window.renderSurveyCorpsTaskView(root,supplied);
supplied.state='completed';supplied.role_details.qa.status='passed';window.renderSurveyCorpsTaskView(root,supplied);
const summary=root.querySelector('[data-sc-preview-summary]');
const metadata=root.querySelector('.sc-task-view__metadata'),taskTypeLabel=metadata.querySelector('dt'),taskTypeValue=metadata.querySelector('dd'),reasonValue=metadata.querySelector('[data-sc-field=role_selection_reason]'),metadataRect=metadata.getBoundingClientRect(),taskTypeLabelRect=taskTypeLabel.getBoundingClientRect(),taskTypeValueRect=taskTypeValue.getBoundingClientRect(),reasonValueRect=reasonValue.getBoundingClientRect(),metadataStyles=getComputedStyle(metadata),reasonStyles=getComputedStyle(reasonValue),metadataLayout={className:metadata.className,gridTemplateColumns:metadataStyles.gridTemplateColumns,alignItems:metadataStyles.alignItems,labelTextAlign:getComputedStyle(taskTypeLabel).textAlign,labelValueTopDelta:Math.abs(taskTypeLabelRect.top-taskTypeValueRect.top),valueStartsAfterLabel:taskTypeValueRect.left>=taskTypeLabelRect.right,reasonWraps:reasonValueRect.height>parseFloat(reasonStyles.lineHeight),reasonFits:reasonValueRect.right<=metadataRect.right+1};
const projectMcps=root.querySelector('[data-sc-project-mcps]'),provided={headerText:root.querySelector('.sc-task-view__header').innerText,taskType:root.querySelector('[data-sc-field=task_type]').textContent,selected:root.querySelector('[data-sc-selected-roles]').textContent,reason:root.querySelector('[data-sc-field=role_selection_reason]').textContent,summary:summary.querySelector('p').textContent,summaryInsideAside:summary.closest('[data-sc-role-preview]')===root.querySelector('[data-sc-role-preview]'),visibleSummaryCount:[...root.querySelectorAll('[data-sc-preview-summary]')].filter(n=>n.checkVisibility({visibilityProperty:true})).length,summaryAfterQA:!!(root.querySelector('[data-sc-role=qa]').compareDocumentPosition(summary)&Node.DOCUMENT_POSITION_FOLLOWING),roleCount:root.querySelectorAll('details[data-sc-role]').length,contextRemoved:!root.querySelector('[data-sc-context]'),namesRemoved:!root.querySelector('[data-sc-agent-name]'),projectMcps:{hidden:projectMcps.hidden,open:projectMcps.open,count:root.querySelector('[data-sc-project-mcp-count]').textContent,names:[...root.querySelectorAll('[data-sc-project-mcp-list] li')].map(node=>node.textContent)},injectedElements:root.querySelectorAll('img').length,metadataLayout};
provided.metrics={taskElapsed:root.querySelector('[data-sc-metric=task-elapsed]').textContent,devElapsed:root.querySelector('[data-sc-role=dev] .sc-task-view__role-metrics dd').textContent,tokenNodes:root.querySelectorAll('[data-sc-metric=task-tokens]').length,tokenText:/Token|12,345|2,345/.test(root.textContent),roleMetricCount:root.querySelectorAll('[data-sc-role=dev] .sc-task-view__role-metrics dd').length};
supplied.work_unit.metrics={elapsed_ms:-1,total_tokens:'999'};supplied.role_details.dev.metrics={elapsed_ms:1.5,total_tokens:-2};window.renderSurveyCorpsTaskView(root,supplied);
const invalidMetrics=[root.querySelector('[data-sc-metric=task-elapsed]').textContent,...[...root.querySelectorAll('[data-sc-role=dev] .sc-task-view__role-metrics dd')].map(node=>node.textContent)];
delete supplied.work_unit.metrics;delete supplied.role_details.dev.metrics;window.renderSurveyCorpsTaskView(root,supplied);
const missingMetrics=[root.querySelector('[data-sc-metric=task-elapsed]').textContent,...[...root.querySelectorAll('[data-sc-role=dev] .sc-task-view__role-metrics dd')].map(node=>node.textContent)];
supplied.work_unit.metrics={elapsed_ms:90061000,total_tokens:12345};supplied.role_details.dev.metrics={elapsed_ms:65000,total_tokens:2345};window.renderSurveyCorpsTaskView(root,supplied);
delete supplied.role_details.qa.agent_name;delete supplied.work_unit.summary;delete supplied.work_unit.project_mcps;window.renderSurveyCorpsTaskView(root,supplied);
const removed={headerText:root.querySelector('.sc-task-view__header').innerText,contextRemoved:!root.querySelector('[data-sc-context]'),namesRemoved:!root.querySelector('[data-sc-agent-name]'),projectMcpsHidden:root.querySelector('[data-sc-project-mcps]').hidden,summary:root.querySelector('[data-sc-preview-summary]').textContent,summaryClass:root.querySelector('[data-sc-preview-summary] p').className};
const roleCases={pending:'待开始',running:'进行中',passed:'通过',blocked:'阻断',needs_user_confirm:'待用户确认'};
const roleStatuses={};const roleStatusClasses={};for(const status of Object.keys(roleCases)){supplied.role_details.qa.status=status;window.renderSurveyCorpsTaskView(root,supplied);const node=root.querySelector('[data-sc-role=qa] .sc-task-view__role-state');roleStatuses[status]=node.textContent;roleStatusClasses[status]=node.className;}
const globalCases={confirmed:'已确认',planned:'计划',dev_in_progress:'开发中',ready_for_cr:'审查阶段',cr_blocked:'审查阻断',ready_for_qa:'测试阶段',qa_failed:'测试失败',qa_conditional:'测试条件通过',qa_passed:'测试通过',workflow_ready:'任务完成',completed:'已完成',complete:'已完成',done:'已完成',success:'已完成',successful:'已完成',succeeded:'已完成',failed:'失败',paused:'已暂停',waiting:'等待中',cancelled:'已取消',canceled:'已取消',needs_user_confirm:'等待用户确认',needs_revalidation:'需要重新验证',needs_revision:'需要修订',blocked:'已阻断'};
const globalStatuses={};const globalStatusClasses={};for(const state of Object.keys(globalCases)){supplied.state=state;window.renderSurveyCorpsTaskView(root,supplied);const node=root.querySelector('[data-sc-field=state]');globalStatuses[state]=node.textContent;globalStatusClasses[state]=node.className;}
supplied.state=payload;supplied.role_details.qa.status=payload;window.renderSurveyCorpsTaskView(root,supplied);
const unknown={global:root.querySelector('[data-sc-field=state]').textContent,role:root.querySelector('[data-sc-role=qa] .sc-task-view__role-state').textContent,img:root.querySelectorAll('img').length};
const prototypeFallbacks=[];for(const status of ['constructor','__proto__','toString']){supplied.role_details.qa.status=status;window.renderSurveyCorpsTaskView(root,supplied);prototypeFallbacks.push(root.querySelector('[data-sc-role=qa] .sc-task-view__role-state').textContent);}
const legacySubskills=root.querySelectorAll('[data-sc-subskills]').length;
const pendingBodies=[];for(const role of ['req','dev','cr','qa']){const pending=structuredClone(next),names={req:'align-with-visuals',dev:'tech-select',cr:'review-with-goal',qa:'test-with-goal'};pending.role_details[role]={status:'pending',summary:payload,evidence:[payload],risks:[payload],next_action:payload,metrics:{elapsed_ms:99},subskills:[{name:names[role],summary:payload}]};window.renderSurveyCorpsTaskView(root,pending);const body=root.querySelector('[data-sc-role='+role+'] > [data-sc-detail-body]');pendingBodies.push({role,text:body.textContent,children:body.childElementCount,controls:body.querySelectorAll('summary,button,input,a').length});}
const skillSnapshot=structuredClone(next);
skillSnapshot.role_details.req={status:'passed',subskills:[{name:'align-with-visuals',status:'completed',goal:'对齐页面',result:'对齐记录'},{name:'grill-with-docs',status:'needs_user_confirm',question:payload,options:[payload,'方案 B'],evidence:[payload]}]};
skillSnapshot.role_details.dev={status:'passed',subskills:[{name:'tech-select',status:'needs_user_confirm',goal:payload,summary:payload,question:payload,options:[payload,'方案 B'],evidence:[payload],result:payload},{name:'refactor-with-goal',status:'completed',summary:'重构记录'},{name:'bug-fix',status:'completed',summary:'修复记录'},{name:'bug-cause',status:'completed',summary:'根因记录'},{name:'optimize',status:'completed',summary:'优化记录'}]};
skillSnapshot.role_details.cr={status:'passed',subskills:[{name:'review-with-goal',status:'completed',summary:'审查记录'}]};
skillSnapshot.role_details.qa={status:'running',subskills:[{name:'test-with-goal',status:'running',summary:'测试记录'}]};
const skillBefore=JSON.stringify(skillSnapshot);window.renderSurveyCorpsTaskView(root,skillSnapshot);
const skills=[...root.querySelectorAll('[data-sc-subskill]')].map(node=>({role:node.closest('[data-sc-role]').dataset.scRole,name:node.dataset.scSubskill,open:node.open,summary:node.querySelector('summary').textContent}));
const devSkill=root.querySelector('[data-sc-role=dev] [data-sc-subskill]');
const skillFields={};for(const field of ['goal','summary','question','options','evidence','result'])skillFields[field]=devSkill.querySelector('[data-sc-subskill-field='+field+']')?.textContent;
const skillSafety={forbidden:root.querySelectorAll('[data-sc-subskills] button,[data-sc-subskills] input,[data-sc-subskills] select,[data-sc-subskills] a,img').length,hint:devSkill.textContent.includes('请在当前会话中回复'),unchanged:JSON.stringify(skillSnapshot)===skillBefore};
const qaSkill=root.querySelector('[data-sc-role=qa] [data-sc-subskill]');qaSkill.open=true;qaSkill.dispatchEvent(new Event('toggle'));
const nestedOpen={roles:openRoles(),childOpen:qaSkill.open};
root.querySelector('[data-sc-role=dev]').open=true;root.querySelector('[data-sc-role=dev]').dispatchEvent(new Event('toggle'));
const outerAfterNested=openRoles();
skillSnapshot.role_details.dev.subskills[0].summary='更新的技术方案';window.renderSurveyCorpsTaskView(root,skillSnapshot);
const skillUpdated=root.querySelector('[data-sc-role=dev] [data-sc-subskill-field=summary]').textContent;
const invalidSkills=[];
for(const input of [undefined,null,{},'tech-select',[],[null,[],42,{}, {name:'tech-select'}, {name:'tech-select',status:'running'}, {name:'tech-select',options:['仅候选项']}],[{name:'align-with-visuals',summary:'wrong role'},{name:'constructor',summary:'prototype'},{name:'__proto__',summary:'prototype'},{name:'unknown',summary:'unknown'}]]){
 const invalid=structuredClone(next);invalid.role_details.dev={status:'passed',subskills:input};window.renderSurveyCorpsTaskView(root,invalid);invalidSkills.push(root.querySelectorAll('[data-sc-subskills]').length);
}
const invalidFields=structuredClone(next);invalidFields.role_details.dev={status:'passed',subskills:[{name:'tech-select',summary:'有效记录',goal:{bad:true},question:42,options:[payload],evidence:'not an array',result:['not string']}]};window.renderSurveyCorpsTaskView(root,invalidFields);
const fieldFiltering={fields:[...root.querySelectorAll('[data-sc-role=dev] [data-sc-subskill-field]')].map(node=>node.dataset.scSubskillField),hint:root.querySelector('[data-sc-role=dev] [data-sc-subskills]').textContent.includes('请在当前会话中回复')};
invalidFields.role_details.dev.subskills[0]={name:'tech-select',question:'选择方案',options:[payload,23,null,'','  ','安全选项'],evidence:[23,'','  ',payload]};window.renderSurveyCorpsTaskView(root,invalidFields);
const validListFiltering={options:[...root.querySelectorAll('[data-sc-subskill-field=options] li')].map(node=>node.textContent),evidence:[...root.querySelectorAll('[data-sc-subskill-field=evidence] li')].map(node=>node.textContent)};
const subskillUnknown=[];for(const status of ['constructor','__proto__','unknown']){invalidFields.role_details.dev.subskills[0].status=status;window.renderSurveyCorpsTaskView(root,invalidFields);subskillUnknown.push(root.querySelector('[data-sc-subskill] > summary').textContent.includes('未知状态'));}
delete invalidFields.role_details.dev.subskills;window.renderSurveyCorpsTaskView(root,invalidFields);const subskillsRemoved=root.querySelectorAll('[data-sc-subskills]').length;
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
  const body=root.querySelector('[data-sc-role=dev] > [data-sc-detail-body]'),headings=[...body.querySelectorAll(':scope > h3')];
  missingData.push({name,metadata:['target','task_type','role_selection_reason'].map(field=>root.querySelector('[data-sc-field='+field+']').textContent),headings:headings.map(node=>node.textContent),contents:headings.map(node=>({text:node.nextElementSibling.textContent,items:[...node.nextElementSibling.querySelectorAll('li')].map(item=>item.textContent),children:node.nextElementSibling.childElementCount})),injectedElements:root.querySelectorAll('img').length,executed:window.qaInjected===true});
}
const missingStateLabels=[];for(const status of [undefined,null,'']){window.renderSurveyCorpsTaskView(root,{state:'dev_in_progress',work_unit:{roles:['dev']},role_details:{dev:{status,subskills:[{name:'tech-select',status,summary:'有效记录'}]}}});missingStateLabels.push({role:root.querySelector('[data-sc-role=dev] > summary .sc-task-view__role-state').textContent,subskill:root.querySelector('[data-sc-subskill] > summary .sc-task-view__role-state').textContent});}
const elapsedBoundaries=[];for(const elapsed of [0,1,999,1000]){const sample={work_unit:{metrics:{elapsed_ms:elapsed},roles:[]}};window.renderSurveyCorpsTaskView(root,sample);elapsedBoundaries.push(root.querySelector('[data-sc-metric=task-elapsed]').textContent);}
const result={missingData,missingStateLabels,pendingBodies,focus,lifecycle,boundaries,excludedFallback,invalidStates,emptyView,recovered,initial,sameSnapshot,changedActive,afterReplay,stateBefore,stateAfter,progress,waitingActive,finishedDevActive,flow,defaults,debugTrue,debugString,debugDefault,debugFalse,debugInSnapshot,provided,invalidMetrics,missingMetrics,elapsedBoundaries,payload,removed,roleCases,roleStatuses,roleStatusClasses,globalCases,globalStatuses,globalStatusClasses,unknown,prototypeFallbacks,legacySubskills,skills,skillFields,skillSafety,nestedOpen,outerAfterNested,skillUpdated,invalidSkills,fieldFiltering,validListFiltering,subskillUnknown,subskillsRemoved,toggleAdds,toggleRemoves,initialToggleListeners,activeToggleListeners};
document.body.dataset.scTestResult=JSON.stringify(result);
</script></body></html>`;

const visualHarness = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root">${template}</main><script>
const root=document.getElementById('root'),snapshot=${JSON.stringify(snapshot)};
snapshot.role_details.cr.status='passed';
const subskillTones={pending:'pending',not_started:'pending',running:'active',preparing:'active',in_progress:'active',working:'active',active:'active',started:'active',started_working:'active',completed:'completed',complete:'completed',done:'completed',success:'completed',successful:'completed',succeeded:'completed',passed:'passed',qa_passed:'passed',qa_success:'passed',workflow_ready:'passed',failed:'danger',blocked:'danger',paused:'waiting',cancelled:'pending',canceled:'pending',skipped:'pending',waiting:'waiting',waiting_user:'waiting',needs_user_confirm:'waiting',needs_revision:'revision',constructor:'unknown',['__proto__']:'unknown',toString:'unknown',unrecognized:'unknown'};
const canonicalRoleTones={pending:'pending',running:'active',passed:'passed',blocked:'danger',needs_user_confirm:'waiting'};
const roleTones=Object.fromEntries(Object.keys(subskillTones).map(status=>[status,Object.hasOwn(canonicalRoleTones,status)?canonicalRoleTones[status]:'unknown']));
const globalTones={confirmed:'completed',planned:'pending',dev_in_progress:'active',ready_for_cr:'waiting',cr_blocked:'danger',ready_for_qa:'waiting',qa_failed:'danger',qa_conditional:'revision',qa_passed:'passed',workflow_ready:'passed',completed:'completed',complete:'completed',done:'completed',success:'completed',successful:'completed',succeeded:'completed',failed:'danger',paused:'waiting',waiting:'waiting',cancelled:'pending',canceled:'pending',needs_user_confirm:'waiting',needs_revalidation:'revision',needs_revision:'revision',blocked:'danger'};
const sample=node=>({className:node.className,color:getComputedStyle(node).color});
const roleColors=Object.create(null),globalColors=Object.create(null),subskillColors=Object.create(null),activeRoleMotion=Object.create(null);
for(const status of Object.keys(roleTones)){snapshot.role_details.qa={status,subskills:[{name:'test-with-goal',status,summary:'QA 记录'}]};window.renderSurveyCorpsTaskView(root,snapshot);roleColors[status]=sample(root.querySelector('[data-sc-role=qa] > summary .sc-task-view__role-state'));snapshot.role_details.qa.status='passed';window.renderSurveyCorpsTaskView(root,snapshot);subskillColors[status]=sample(root.querySelector('[data-sc-role=qa] [data-sc-subskill] > summary .sc-task-view__role-state'));}
for(const state of Object.keys(globalTones)){snapshot.state=state;window.renderSurveyCorpsTaskView(root,snapshot);globalColors[state]=sample(root.querySelector('[data-sc-field=state]'));}
for(const status of ['running','preparing','in_progress','working','active','started','started_working']){snapshot.state='ready_for_qa';snapshot.role_details.qa={status};window.renderSurveyCorpsTaskView(root,snapshot);const role=root.querySelector('[data-sc-role=qa]'),roleStyles=getComputedStyle(role);activeRoleMotion[status]={active:role.classList.contains('is-active'),animation:roleStyles.animationName,borderColor:roleStyles.borderTopColor};}
snapshot.state='ready_for_qa';snapshot.role_details.qa={status:'running'};window.renderSurveyCorpsTaskView(root,snapshot,{debug:true});root.querySelector('[data-sc-play-animation]').click();
const connectors=[...root.querySelectorAll('.sc-task-view__connector')].map(node=>{const stem=getComputedStyle(node,'::before'),head=getComputedStyle(node,'::after');return {width:node.offsetWidth,height:node.offsetHeight,stemWidth:stem.width,stemHeight:stem.height,headTransform:head.transform,left:head.borderLeftWidth,right:head.borderRightWidth,top:head.borderTopWidth,bottom:head.borderBottomWidth,topColor:head.borderTopColor,leftColor:head.borderLeftColor,rightColor:head.borderRightColor,color:getComputedStyle(node).color,hidden:node.getAttribute('aria-hidden'),next:node.nextElementSibling.dataset.scRole,animation:getComputedStyle(node).animationName};});
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,view=root.querySelector('.sc-task-view'),active=root.querySelector('details.is-active');
const header=root.querySelector('.sc-task-view__header'),status=root.querySelector('[data-sc-field=state]'),headerRect=header.getBoundingClientRect(),statusRect=status.getBoundingClientRect();
const statusLayout={centerOffset:Math.abs((statusRect.left+statusRect.right)/2-(headerRect.left+headerRect.right)/2),fontSize:getComputedStyle(status).fontSize,eyebrowCount:root.querySelectorAll('.sc-task-view__root > .sc-task-view__muted').length,titleCount:root.querySelectorAll('h2').length};
const idle=root.querySelector('[data-sc-role=req]');const result={roleTones,subskillTones,globalTones,roleColors,subskillColors,globalColors,activeRoleMotion,connectors,statusLayout,reduced,viewAnimation:getComputedStyle(view).animationName,activeAnimation:getComputedStyle(active,'::before').animationName,idleAnimation:getComputedStyle(idle,'::before').animationName,replay:active.classList.contains('is-manual-replay'),viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};parent.postMessage({scVisualResult:result},'*');
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
  assert.deepEqual(defaultValues, { summary: "", summaryDom:0, bottomSummary:0, selected: "REQ → DEV → CR → QA", contextRemoved: true, namesRemoved: true, projectMcpsHidden: true, debugHidden: true, autoMotion: false, frameBorders:{context:"2px",preview:"2px",role:"2px",roleDivider:"2px",previewDivider:"2px"} }, "task context and both task information frames and their internal dividers must use 2px borders");
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
    assert.deepEqual(item.headings,["摘要","必要证据","风险","下一步"],item.name+" must retain detail headings");
    assert.deepEqual(item.contents,Array.from({length:4},()=>({text:items.join(""),items,children:items.length?1:0})),item.name+" must suppress empty bullets while preserving supplied text");
    assert.equal(item.injectedElements,0,item.name+" must use textContent instead of interpreting HTML");
    assert.equal(item.executed,false,item.name+" must not execute supplied HTML");
  }
  assert.deepEqual(result.missingStateLabels,Array.from({length:3},()=>({role:"状态未提供",subskill:"状态未提供"})),"missing role and subskill states retain semantic messages");
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
  assert.deepEqual(result.pendingBodies,["req","dev","cr","qa"].map(role=>({role,text:"",children:0,controls:0})),"pending bodies suppress supplied fields, metrics, subskills and controls"); assert.equal(result.legacySubskills, 0, "old snapshots must not list unused subskills");
  assert.deepEqual(result.skills.map(({role,name,open})=>({role,name,open})), [{role:'req',name:'align-with-visuals',open:false},{role:'req',name:'grill-with-docs',open:false},{role:'dev',name:'tech-select',open:false},{role:'dev',name:'refactor-with-goal',open:false},{role:'dev',name:'bug-fix',open:false},{role:'dev',name:'bug-cause',open:false},{role:'dev',name:'optimize',open:false},{role:'cr',name:'review-with-goal',open:false},{role:'qa',name:'test-with-goal',open:false}], "only explicitly called role-owned subskills must appear collapsed inside their roles");
  assert.ok(result.skills[2].summary.includes("等待用户确认"));
  for (const field of ["goal", "summary", "question", "options", "evidence", "result"]) assert.ok(result.skillFields[field].includes(result.payload), `${field} must preserve safe text`);
  assert.deepEqual(result.skillSafety,{forbidden:0,hint:true,unchanged:true}, "records are read-only and must not mutate snapshot or create interactive approval controls");
  assert.deepEqual(result.nestedOpen,{roles:["qa"],childOpen:true}, "nested details must not enter outer role accordion selection");
  assert.deepEqual(result.outerAfterNested,["dev"], "outer role accordion still permits one role after nested details open");
  assert.equal(result.skillUpdated,"更新的技术方案");
  assert.ok(result.invalidSkills.every(count=>count===0), "invalid subskills, empty records, wrong-role and prototype names must remain hidden");
  assert.deepEqual(result.fieldFiltering,{fields:["summary"],hint:false}, "invalid field types and questionless options must not render");
  assert.deepEqual(result.validListFiltering,{options:[result.payload,"安全选项"],evidence:[result.payload]}, "list fields accept only nonempty strings");
  assert.deepEqual(result.subskillUnknown,[true,true,true]);
  assert.equal(result.subskillsRemoved,0, "subskill removal must remove stale records");
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
    assert.ok(observed.statusLayout.centerOffset<=1,"global status must remain centered in the header");
    assert.equal(observed.statusLayout.fontSize,"18px","global status must use enlarged type");
    assert.equal(observed.statusLayout.eyebrowCount,0,"work unit eyebrow must not render");
    assert.equal(observed.statusLayout.titleCount,0,"the redundant task-flow title must not render");
    assert.ok(Object.hasOwn(observed.roleColors,"__proto__")&&Object.hasOwn(observed.subskillColors,"__proto__"),"prototype-name color cases must be executed and retained");
    for(const [status,tone] of Object.entries(observed.roleTones)) {
      for(const item of [observed.roleColors[status]]) {
        assert.ok(item.className.includes(`sc-task-view__state--${tone}`), `${status} must carry the ${tone} semantic class`);
        assert.equal(item.color,toneColors[tone],`${status} must render the ${tone} color in roles and subskills`);
      }
    }
    for(const [status,tone] of Object.entries(observed.subskillTones)) assert.equal(observed.subskillColors[status].color,toneColors[tone],`${status} must retain the legacy subskill color`);
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
