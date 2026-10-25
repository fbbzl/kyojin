"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appTemplate = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");
const skillPath = path.join(__dirname, "..", "SKILL.md");
const repositoryRoot = path.resolve(__dirname, "..", "..", "..");
const isSourceTree = fs.existsSync(path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"));
assert.ok(!isSourceTree || fs.existsSync(skillPath), "repository Skill is missing from the source tree");
const skill = isSourceTree ? fs.readFileSync(skillPath, "utf8") : null;
const script = appTemplate.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = { window: {} };
vm.runInNewContext(script.replace(/\}\)\(\);\s*$/, "window.statusContract={stateText,stateClass,renderGitInfo,resolveActiveRole,renderWorkflowMotion,renderRootMetadata,taskSummaryNode,roleEmoji,filePath,observeFileActivity};})();"), context, { timeout: 1000 });
const { stateText, stateClass, renderGitInfo, resolveActiveRole, renderWorkflowMotion, renderRootMetadata, taskSummaryNode, roleEmoji, filePath, observeFileActivity } = context.window.statusContract;
const roleStatesLiteral = appTemplate.match(/const roleStates=(\{[^\r\n]+\});/)?.[1] || "";
const activityInput=(current,view_id="files",state="dev_in_progress")=>({view_id,state,role_details:{dev:{file_activity:{previous:"src/a.js",current,next:"test/c.js"}}}});
const firstActivity=observeFileActivity(null,activityInput("src/b.js"),"dev");
assert.equal(firstActivity.changed,false,"first file observation must remain static");
assert.equal(observeFileActivity(firstActivity,activityInput("src/b.js"),"dev").changed,false,"same file refresh must not roll again");
assert.equal(observeFileActivity(firstActivity,activityInput("test/c.js"),"dev").changed,true,"a same-task same-role file change must roll once");
for (const previous of [undefined,"src/stale.js"]) {
  const input=activityInput("src/c.js");
  input.role_details.dev.file_activity.previous=previous;
  const activity=observeFileActivity(firstActivity,input,"dev");
  assert.equal(activity.fromCurrent,"src/b.js","transition must start with the actual observed previous current");
  assert.equal(activity.previous,previous||"","settled previous must keep only the reported path");
}
assert.ok(appTemplate.includes("previous.textContent=previous.title=activity.fromCurrent;"),"the moving old row must not use stale or missing reported previous");
assert.equal(observeFileActivity(firstActivity,activityInput("test/c.js","other"),"dev").changed,false,"changing task must not replay a file roll");
assert.equal(observeFileActivity({...firstActivity,role:"cr"},activityInput("test/c.js"),"dev").changed,false,"changing active roles must not replay a file roll");
assert.equal(observeFileActivity(firstActivity,activityInput(""),"dev"),null,"clearing current must clear the entire file activity");
assert.equal(observeFileActivity(firstActivity,activityInput("test/c.js"),null),null,"no legitimate active role may show an operation");
for (const state of ["paused","waiting","blocked","needs_user_confirm","workflow_ready","skipped"]) assert.equal(observeFileActivity(firstActivity,activityInput("test/c.js","files",state),"dev"),null,"stopped and finished states must hide file activity");
for (const path of [undefined,null,{},42,"","  ","../secret","src/../secret","C:/private","/private","https://example.test/file","src/line\nfile"]) assert.equal(filePath(path),"","only actual repository-relative paths may be displayed");
assert.equal(filePath(" src/<img onerror=alert(1)>.js "),"src/<img onerror=alert(1)>.js","path text must remain literal for textContent output");
assert.ok(appTemplate.includes("node.textContent=node.title=value;"),"file paths must use literal textContent and a full-path tooltip");
assert.ok(appTemplate.includes("if (node.textContent!==value)"),"same-file refresh must preserve horizontal reading position");
assert.ok(appTemplate.includes("height:44px;")&&appTemplate.includes("height:22px;")&&appTemplate.includes("transform:translateY(-11px);"),"file window must show two half rows around one full current row");
assert.ok(appTemplate.includes("animation:sc-file-switch 220ms ease-out 1;"),"file changes must use one finite short CSS animation");
const assertSkillMatch = (pattern, message) => { if (skill) assert.match(skill, pattern, message); };
const assertSkillDoesNotMatch = (pattern, message) => { if (skill) assert.doesNotMatch(skill, pattern, message); };
const snapshotExample = skill?.match(/### 任务视图数据契约[\s\S]*?```yaml\r?\n([\s\S]*?)\r?\n```/)?.[1] || "";
const workUnitExample = snapshotExample.match(/^work_unit:\r?\n([\s\S]*?)(?=^[^\s#][^:\r\n]*:)/m)?.[1] || "";

const gitNode = {};
const gitRoot = { querySelector: () => gitNode };
const gitPayload = '<img src=x onerror="alert(1)">';
const gitWork = { git: { repository: " kyojin ", branch: gitPayload, commit: "abcdef1234567890", dirty: true } };
renderGitInfo(gitRoot, gitWork);
assert.equal(gitNode.textContent, `kyojin · ${gitPayload}`, "Git display must contain only literal repository and branch names");
assert.equal(gitNode.hidden, false);
assert.equal(gitWork.git.commit, "abcdef1234567890", "hidden legacy metadata must remain in the snapshot");
for (const git of [undefined, null, [], "main", {}, { repository: 42, branch: {}, commit: "invalid", dirty: "true" }, { repository: "  ", branch: " ", commit: "abcdef", dirty: false }, { commit: "abcdef1234567890" }, { dirty: true }, { commit: "abcdef1234567890", dirty: false }]) {
  renderGitInfo(gitRoot, { git });
  assert.equal(gitNode.hidden, true, "missing or invalid Git metadata must hide the whole row");
  assert.equal(gitNode.textContent, "", "rerender must clear stale Git information");
}
renderGitInfo(gitRoot, { git: { branch: "main", dirty: false } });
assert.equal(gitNode.textContent, "main", "partial metadata must not invent a prefix or missing repository");
for (const dirty of [true, false]) {
  renderGitInfo(gitRoot, { git: { repository: " kyojin ", branch: " codex/sc-git-animated-emoji ", commit: "abcdef1234567890", dirty } });
  assert.equal(gitNode.textContent, "kyojin · codex/sc-git-animated-emoji", "commit and dirty values must never add visible metadata");
}
renderGitInfo(gitRoot, { git: { repository: "kyojin" } });
assert.equal(gitNode.textContent, "kyojin");
assert.match(appTemplate, /<header[^>]*>\s*<div class="sc-task-view__topbar">\s*<p[^>]*data-sc-git hidden[^>]*>[\s\S]*?data-sc-field="state"/, "Git and global state must share the first header row in that order");
assert.match(appTemplate, /\.sc-task-view\.is-running details\.is-active \.sc-task-view__role-emoji \{ animation:sc-fire-flicker var\(--emoji-period\)/, "only the resolved active role of an unfinished task may animate its fire");
assert.match(appTemplate, /@keyframes sc-fire-flicker \{[^\r\n]*scale\(\.96,1\.04\)[^\r\n]*scale\(1\.04,\.96\)/, "running fire must visibly deform through each shared period");
for (const [pseudo,motion] of [["before","sc-flame-tongue"],["after","sc-fire-sparks"]]) assert.match(appTemplate, new RegExp('is-running details\\.is-active \\.sc-task-view__role-emoji::'+pseudo+' \\{[^}]*position:absolute;[^}]*pointer-events:none;[^}]*animation:'+motion+' var\\(--emoji-period\\)'), "fire tongue and sparks must share the existing activity gate and period");
assert.match(appTemplate, /@keyframes sc-fire-sparks \{[^\r\n]*translate\(2px,-9px\)/, "fixed sparks must visibly rise without a particle system");
assert.match(appTemplate, /emoji\.setAttribute\("aria-hidden","true"\)/, "the emoji must remain decorative");
assert.match(appTemplate, /\.sc-task-view__role-emoji \{[^}]*font-size:18px;/, "role emoji must use the larger eighteen-pixel size in its existing position");
for (const role of ["req","dev","cr","qa"]) {
  for (const blocker_type of [undefined,null,"bug","BUG"," bug ",{},true]) {
    const detail={status:"blocked",blocker_type,summary:"Bug reported"},before=JSON.stringify(detail);
    const bug=["cr","qa"].includes(role)&&blocker_type==="bug",emoji=roleEmoji(role,detail);
    assert.equal(emoji.symbol,bug?"🐞":"👻");assert.equal(emoji.motion,bug?"is-blocked-bug":"is-blocked-ghost");
    assert.equal(JSON.stringify(detail),before,"emoji derivation must preserve the authoritative detail");
  }
  for (const [status,symbol,motion] of [["passed","🎉","is-celebrating"],["needs_user_confirm","⌛","is-awaiting-user"],["pending","⌛","is-awaiting-user"],["running","🔥",""],["BLOCKED","🛠️",""],[undefined,"🛠️",""]]) {
    const emoji=roleEmoji(role,{status,blocker_type:"bug"});assert.equal(emoji.symbol,symbol);assert.equal(emoji.motion,motion);
  }
}
assert.match(appTemplate, /has-blocked-motion \.sc-task-view__role-emoji\.is-blocked-ghost \{ animation:sc-ghost-float var\(--emoji-period\)/, "ordinary blockers must use the shared gentle float period");
assert.match(appTemplate, /@media \(prefers-reduced-motion:no-preference\) \{ \.sc-task-view\.has-blocked-motion \.sc-task-view__role-emoji\.is-blocked-ghost::before \{[^}]*position:absolute;[^}]*pointer-events:none;[^}]*animation:sc-ghost-tongue var\(--emoji-period\)/, "ghost tongues must reuse the blocker gate and disappear under reduced motion");
assert.match(appTemplate, /@keyframes sc-ghost-tongue \{ 0%,20%,85%,100% \{ transform:scaleY\(0\); \} 40%,65% \{ transform:scaleY\(1\); \} \}/, "the tongue must extend and retract continuously within the existing period");
assert.match(appTemplate, /has-blocked-motion \.sc-task-view__role-emoji\.is-blocked-bug \{ animation:sc-bug-crawl var\(--emoji-period\)/, "explicit CR and QA bugs must use the shared crawl period");
assert.match(appTemplate, /\.sc-task-view\.has-waiting-motion \.sc-task-view__role-emoji\.is-awaiting-user \{[^}]*animation:sc-hourglass-flip var\(--emoji-period\) ease-in-out var[(]--emoji-delay[)] infinite/, "waiting hourglasses must animate independently of running-role activity");
assert.match(appTemplate, /@keyframes sc-hourglass-flip \{ 0%,70% \{ transform:rotate\(0\); \} 100% \{ transform:rotate\(180deg\); \} \}/, "the hourglass must pause between flips");
for (const [role,period,delay] of [["req","2.4s","-.3s"],["dev","2.9s","-1.1s"],["cr","3.4s","-2s"],["qa","3.9s","-2.8s"]]) {
  assert.ok(appTemplate.includes(`details[data-sc-role="${role}"] { --emoji-period:${period}; --emoji-delay:${delay}; }`), "each role must use its own celebration period and negative phase");
}
assert.match(appTemplate, /role-emoji[.]is-celebrating [{] animation:sc-role-celebrate var[(]--emoji-period[)] ease-out var[(]--emoji-delay[)] infinite;/, "passed roles must celebrate continuously on their local period and phase");
assert.match(appTemplate, /animation:sc-confetti-burst var[(]--emoji-period[)] ease-out var[(]--emoji-delay[)] infinite;/, "confetti must share its emoji period and phase");
assert.match(appTemplate, /36%,100% [{] opacity:0; transform:translate[(]var[(]--burst-x[)],-65%[)]/, "each burst must finish within the first 36 percent and rest for the remainder");
assert.ok(appTemplate.includes(".sc-task-view__detail-field, .sc-task-view__summary-content > section { min-width:0; padding:10px 12px; border:2px solid var(--line); border-radius:6px; }"), "detail and summary groups must share lightweight bordered sections");
assert.ok(appTemplate.includes(".sc-task-view__detail { display:grid; gap:16px;"), "inline detail groups must use a vertical grid gap");
assert.ok(!appTemplate.includes(".sc-task-view__detail-field + .sc-task-view__detail-field"), "detail spacing must not combine sibling margins and grid gaps");
assert.doesNotMatch(appTemplate, /animateRolePasses|__scRoleStatuses|__scRolePassMotionCleanup|className==="is-celebrating"/, "state-driven celebration must remove obsolete one-shot lifecycle management");

const laneFrame = { toggleAttribute: (name, value) => { assert.equal(name, "hidden"); laneFrame.hidden = value; }, closest: selector => { assert.equal(selector, ".sc-task-view"); return { classList: { toggle: (name, value) => { const field={"is-running":"running","has-waiting-motion":"waiting","has-blocked-motion":"blocked"}[name];assert.ok(field);laneFrame[field]=value; } } }; } };
const laneRoot = { querySelector: () => laneFrame };
const selectedRoles = ["dev", "cr", "qa"];
const validDetails = { dev: { status: "running" }, cr: { status: "pending" }, qa: { status: "pending" } };
renderWorkflowMotion(laneRoot, selectedRoles, resolveActiveRole(validDetails, "dev_in_progress", selectedRoles), "dev_in_progress");
assert.equal(laneFrame.waiting, true, "pending hourglasses may flip while another role works");
assert.equal(resolveActiveRole(validDetails, "dev_in_progress", selectedRoles), "dev", "pending hourglasses must not change the sole active role");
for (const [state, details, expected] of [
  ["dev_in_progress", validDetails, true],
  ...["paused", "waiting", "blocked", "needs_user_confirm", "completed", "workflow_ready", "skipped", "passed", "qa_success"].map(state => [state, validDetails, false]),
  ["planned", { dev: { status: "pending" } }, false],
  ["ready_for_cr", { dev: { status: "running" }, cr: { status: "running" } }, false],
  ["ready_for_qa", { cr: { status: "pending" }, qa: { status: "running" } }, false],
  ["ready_for_qa", { cr: { status: "passed" }, qa: { status: "running" } }, true],
]) {
  renderWorkflowMotion(laneRoot, selectedRoles, resolveActiveRole(details, state, selectedRoles), state);
  assert.equal(laneFrame.hidden, false, "selected role chains retain their frame");
  assert.equal(laneFrame.running, expected, `${state} must not invent workflow activity`);
}
renderWorkflowMotion(laneRoot, [], null, "planned");
assert.equal(laneFrame.hidden, true, "an empty role selection must not show an empty frame");
assert.equal(laneFrame.running, false);
for (const [state, expected] of [["needs_user_confirm", true], ["dev_in_progress", true], ["paused", false], ["waiting", false], ["blocked", false], ["cancelled", false], ["workflow_ready", false], ["completed", false], ["skipped", false]]) {
  renderWorkflowMotion(laneRoot, selectedRoles, null, state);
  assert.equal(laneFrame.waiting, expected, state + " must preserve the waiting animation gate");
  assert.equal(laneFrame.running, false, "waiting motion must not invent an active role");
}
for (const [state, expected] of [["blocked",true],["cr_blocked",true],["qa_failed",true],["needs_user_confirm",true],["paused",false],["waiting",false],["cancelled",false],["canceled",false],["completed",false],["workflow_ready",false],["skipped",false]]) {
  renderWorkflowMotion(laneRoot,selectedRoles,null,state);assert.equal(laneFrame.blocked,expected,state+" blocker motion gate");
  assert.equal(laneFrame.running,false,"blocker animation must not invent role activity");
}
assert.match(appTemplate, /<svg[^>]*data-sc-lane-frame hidden aria-hidden="true" focusable="false"[^>]*><rect><\/rect><\/svg>\s*<div class="sc-task-view__roles"/, "the decorative frame must sit outside the role sequence");
assert.match(appTemplate, /lane-frame \{[^}]*pointer-events:none/, "the frame must not intercept card or detail interactions");
assert.match(appTemplate, /\.sc-task-view__workspace \{[^}]*padding-left:8px/, "the workspace must reserve the frame's left gutter inside the context boundary");
assert.match(appTemplate, /lane-frame rect \{[^}]*stroke-width:2px; stroke-dasharray:6px 6px/, "the workflow frame must use a two-pixel dashed stroke");
assert.match(appTemplate, /@keyframes sc-lane-flow \{ from \{ stroke-dashoffset:0; \} to \{ stroke-dashoffset:-12px; \} \}/, "the dashes must travel one seamless period without rotating the frame");
assert.match(appTemplate, /\.sc-task-view\.is-running \.sc-task-view__lane-frame rect \{ animation:sc-lane-flow 1\.2s linear infinite;/, "only the outer dashed frame uses the faster 1.2-second period");
assert.match(appTemplate, /\.sc-task-view\.is-running \.sc-task-view__selection-arrow::before[^}]*animation:sc-preview-flow var\(--motion-period\) linear infinite/, "selection arrow shimmer must reuse the shared activity gate and existing left-to-right effect");
assert.match(appTemplate, /selection-role \{[^}]*border:2px solid var\(--line\); border-radius:6px/, "selection labels must use compact two-pixel rounded frames");
assert.match(appTemplate, /selection-arrow \{[^}]*height:2px;[^}]*font-size:0; line-height:0/, "selection shafts must use fixed geometry rather than font baselines");
assert.match(appTemplate, /selection-arrow::before \{[^}]*top:0;[^}]*height:2px/, "the highlight must share the two-pixel shaft's vertical extent");
assert.match(appTemplate, /selection-arrow::after \{[^}]*right:0; top:50%;[^}]*transform:translateY\(-50%\)/, "the arrow tip must share the shaft centerline and its right endpoint");
assert.doesNotMatch(appTemplate, /(?:\[data-sc-selected-roles\]|selection-step) \{[^}]*gap:/, "selection arrows must touch both adjoining label borders");
assert.match(appTemplate, /selection-arrow \{[^}]*flex:0 0 22px/, "arrow lengths must remain fixed on both wide and narrow screens");
assert.match(appTemplate, /@media \(max-width:560px\) \{ \.sc-task-view \[data-sc-selected-roles\] \{ grid-column:1\/-1; \} \}/, "narrow role chains must span the metadata below their label without shrinking typography");

function selectionNode(tagName) {
  return { tagName, children: [], attributes: {}, classList: { toggle() {} },
    get textContent() { return this.children.map(node => node.textContent).join(""); },
    set textContent(value) { this.children = [{ textContent: value }]; },
    append(...nodes) { this.children.push(...nodes); },
    prepend(...nodes) { this.children.unshift(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute(name, value) { this.attributes[name] = value; } };
}
context.document = { createElement: selectionNode };
const selection = selectionNode("dd"), selectionRoot = { querySelector: () => selection };
for (const [summary,count] of [[undefined,1],["",1],["   ",1],["暂无总结",2]]) {
  renderRootMetadata(selectionRoot,{summary},[]); const node=taskSummaryNode(selectionRoot);
  assert.equal(node.children.length,count,"missing content leaves only the title; explicit literal content remains valid");
  assert.equal(node.children[0].textContent,"任务总结");
  if (count===2) assert.equal(node.children[1].children[1].textContent,"暂无总结");
}
for (const [selected, text] of [[[], "尚未选择"], [["cr"], "CR"], [["cr", "dev", "qa"], "CR → DEV → QA"], [["req", "dev", "cr", "qa"], "REQ → DEV → CR → QA"], [[], "尚未选择"]]) {
  const work = { roles: selected, summary: "保留结果", next_action: "权威下一步" }, before = JSON.stringify(work);
  renderRootMetadata(selectionRoot, work, selected);
  assert.equal(selection.textContent, text, "selection must retain the declared role order and clear stale nodes");
  assert.equal(JSON.stringify(work), before, "metadata rendering must not mutate its snapshot");
  if (!selected.length) continue;
  assert.equal(selection.children.length, selected.length);
  assert.deepEqual(selection.children.map(step => step.children.at(-1).className), selected.map(() => "sc-task-view__selection-role"));
  assert.deepEqual(selection.children.map(step => step.children.length), selected.map((_, index) => index ? 2 : 1), "arrows must only separate adjacent role labels");
  for (const step of selection.children.slice(1)) assert.equal(step.children[0].attributes["aria-hidden"], "true", "decorative arrows must not imply handoff controls");
}

assert.match(appTemplate, /font:13px\/1\.6 "Segoe UI Variable","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif/, "task view body copy must prefer readable system CJK sans-serif fonts");
assert.doesNotMatch(appTemplate, /font:13px\/1\.5 ui-monospace/, "task view body copy must not default to a monospace font");
assert.match(appTemplate, /const roles=\["req","dev","cr","qa"\]/, "task flow must retain the canonical role set");
assert.match(appTemplate, /selectedRoles\.forEach\(\(role,index\)=>/, "task flow must render selected roles in declared order");
assert.doesNotMatch(appTemplate, /data-sc-exit|sc-task-view__exit|QA · 唯一任务出口/, "QA exit must not render a separate node or retain its styles");
assert.match(appTemplate, /roleName\.textContent=roleLabels\[role\]/, "role titles must use the plain role label without a QA exit suffix");
assert.match(appTemplate, /<aside[^>]*data-sc-role-preview[\s\S]*?<div class="sc-task-view__preview-summary" data-sc-preview-summary><\/div>[\s\S]*?<\/aside>/, "task summary must use the same aside and start with no summary DOM");
assert.doesNotMatch(appTemplate, /data-sc-task-summary|sc-task-view__task-summary/, "the removed bottom summary must not remain in DOM or styles");
assert.match(appTemplate, /replaceChildren\(\.\.\.\(root\.__scSummaryInPreview\?\[taskSummaryNode\(root\)\]:\[\]\)\)/, "only a finished task without selected running roles may populate the summary");
assert.doesNotMatch(appTemplate, /empty\.textContent="暂无总结"|if \(!summary\.childElementCount\)/, "missing summary fields must leave the summary body blank without a generated fallback");
assert.doesNotMatch(appTemplate, /任务上下文|data-sc-context|sc-task-view__context/, "the task context panel must be removed from the view");
assert.match(appTemplate, /data-sc-selected-roles>尚未选择</, "the view must not infer all roles as selected");
assert.doesNotMatch(appTemplate, /SC TASK FLOW|<h2\b/, "the redundant visual task-flow title must not render");
assert.match(appTemplate, /<dl class="sc-task-view__metadata">[\s\S]*?<dt>任务类型<\/dt><dd data-sc-field="task_type">[\s\S]*?<dt>参与角色<\/dt><dd data-sc-selected-roles>[\s\S]*?<dt>选择原因<\/dt><dd data-sc-field="role_selection_reason">/, "required task metadata must remain in the stable label-value list");
assert.match(appTemplate, /data-sc-metric="task-elapsed"/, "task metadata must expose measured elapsed time");
assert.doesNotMatch(appTemplate, /task-tokens|total_tokens|Token|formatTokens/, "task and role cards must not render or format token usage");
assert.match(appTemplate, /function formatElapsed\(value\)/, "elapsed time must use a deterministic formatter");
assert.match(appTemplate, /const validMetric=value=>Number\.isSafeInteger\(value\)&&value>=0/, "metrics must reject missing, fractional and negative values");
assert.match(appTemplate, /elapsed\.className="sc-task-view__role-elapsed"/, "completed role elapsed must render inside its role card");
assert.doesNotMatch(appTemplate, /data-sc-preview-role|data-sc-preview-state|data-sc-preview-metrics|sc-task-view__preview-heading|sc-task-view__preview-identity|sc-task-view__role-metrics/, "the detail preview must not retain its removed header or duplicate metrics");
assert.match(appTemplate, /renderTaskMetrics\(root,work,state\)/, "task metrics must be refreshed on every snapshot");
if (skill) assert.match(workUnitExample, /^  metrics:.*elapsed_ms/m, "snapshot example must nest elapsed time as a direct work_unit field");
assert.doesNotMatch(snapshotExample, /\nwork_unit\.metrics:/, "snapshot example must not document task metrics as a root-level dotted key");
assertSkillMatch(/role_details:\s+# 可选，以 req\/dev\/cr\/qa 为键[\s\S]*?metrics:.*elapsed_ms/, "snapshot contract must document role elapsed time");
assertSkillMatch(/服务端.*累计/, "the server must own elapsed time accumulation");
assertSkillMatch(/视图不得自行计时、推算/, "view must not invent elapsed time");
assertSkillMatch(/work_unit\.roles` 只列本轮实际执行的角色，不沿用历史工作单元的角色链/, "role selection must be scoped to the current work unit");
assertSkillMatch(/已登记 Bug 的默认链路为 `dev -> cr -> qa`.*才前置 `req`/, "registered bugs must not add REQ unless requirement clarification is necessary");
assertSkillMatch(/启动所选角色前，先提交.*status=running.*再启动对应 subagent/, "the role timer must start before subagent work begins");
assert.match(appTemplate, /border-radius:8px/, "task view must use a restrained rounded outer surface");
assert.match(appTemplate, /border-radius:6px/, "cards must use restrained rounded corners");
assert.match(appTemplate, /transition:box-shadow 160ms ease/, "cards must use short hover transitions");
assert.match(appTemplate, /prefers-reduced-motion:reduce/, "transitions must respect reduced motion");
assert.match(appTemplate, /\.sc-task-view__metadata \{[^}]*grid-template-columns:6em minmax\(0,1fr\);[^}]*align-items:baseline/, "task metadata must use a fixed label column and a baseline-aligned value column");
assert.match(appTemplate, /\.sc-task-view__metadata dd \{[^}]*min-width:0;[^}]*margin:0;[^}]*overflow-wrap:anywhere/, "long metadata values must stay inside the value column");
assert.doesNotMatch(appTemplate, /sc-task-view__eyebrow|data-sc-field="project_name"|data-sc-field="view_id"|SURVEY CORPS \/|view_id:input\.view_id/, "the top metadata row and its project/view identifiers must not render");
assert.doesNotMatch(appTemplate, /SC \/ WORK UNIT/, "the work unit eyebrow must not render");
assert.match(appTemplate, /\.sc-task-view__topbar \{[^}]*grid-template-columns:minmax\(0,1fr\) auto;[^}]*align-items:start/, "the top row must reserve a wrapping Git column and an independent right status column");
assert.match(appTemplate, /\.sc-task-view__status \{[^}]*grid-column:2; justify-self:end/, "the status must remain on the right even without Git metadata");
assert.match(appTemplate, /\.sc-task-view__status \{[^}]*font-size:26px; line-height:31[.]2px;/, "the global status must use twenty-six-pixel type without increasing its fixed 31.2px line height");
assert.match(appTemplate, /data-sc-field="state" aria-live="polite"[\s\S]*?<\/div>[\s\S]*?header-controls/, "debug controls must remain outside the Git and status row");
assert.match(appTemplate, /<details class="sc-task-view__project-mcps" data-sc-project-mcps hidden>[\s\S]*?项目 MCP[\s\S]*?data-sc-project-mcp-list/, "project MCP names must render as a default-collapsed left header section");
assert.match(appTemplate, /function renderProjectMcps\(root,work\)[\s\S]*?work\.project_mcps[\s\S]*?section\.hidden=!mcps\.length[\s\S]*?item\.textContent=name/, "project MCPs must be supplied by the snapshot, hidden when absent, and rendered as text only");
assert.match(appTemplate, /projectMcpName=value=>\{ const name=optionalText\(value\)\.toLowerCase\(\); return \/\^\[a-z\]/, "project MCP names must be normalized and restricted to safe identifiers");
assertSkillMatch(/project_mcps: \[\].*当前项目已生效的 MCP 名称/, "snapshot contract must declare explicit project MCP names");
assertSkillMatch(/视图不得读取或推断本机宿主配置/, "project MCP display must not scan local host configuration");
assert.doesNotMatch(appTemplate, /@media \(max-width:560px\)[^\r\n]*\.sc-task-view__(?:header|topbar) \{/, "narrow screens must retain the same two-column Git and status layout");
assert.match(appTemplate, /header-controls:has\(> button\[hidden\]\) \{ display:none; \}/, "hidden debug controls must not reserve an empty toolbar row");
assertSkillMatch(/project_name:\s+# 可选；当前会话所属项目名称，UI 不展示，不得猜测/, "the optional project name must remain in the snapshot contract without rendering");
assert.doesNotMatch(appTemplate, /data-sc-agent-name|sc-task-view__agent-name/, "subagent names must not render in role cards");
assert.match(appTemplate, /data-sc-play-animation hidden/, "animation replay is a hidden debug control by default");
assert.doesNotMatch(appTemplate, /data-sc-subskill|data-sc-preview-subskill|sc-task-view__subskills|sc-task-view__size-subskill|subskillNode|renderSubskills|syncPreviewSubskills/, "detail views must not retain removed subskill DOM, controls or mirror logic");
assert.doesNotMatch(appTemplate, /data-sc-subskill-submit|data-sc-subskill-approve|data-sc-subskill-choice/, "subskill records must not imply a reply or approval channel");
assert.doesNotMatch(appTemplate, /data-sc-tree-gate|回到 SC|data-sc-state-reference|sc-task-view__console|data-sc-events|Session log/, "nonessential or post-QA views must not be rendered");
assert.match(appTemplate, /const active=selectedRoles\.filter/, "activity must be resolved only from selected roles");
assert.match(appTemplate, /node\.open=role===openRole/, "role expansion must follow the preserved or newly resolved open role");
assert.match(appTemplate, /const active=role===activeRole/, "role cards must compare against one resolved active role");
assert.match(appTemplate, /querySelectorAll\("details\[data-sc-role\]\[open\]"\).*if \(node!==opened\) node\.open=false/, "opening one role must close every other role");
assert.match(appTemplate, /userOpenRole=root\.querySelector\("details\[data-sc-role\]\[open\]"\)\?\.dataset\.scRole/, "rerender must capture the user's currently open role before replacing nodes");
assert.match(appTemplate, /sameView&&root\.__scResolvedActiveRole===activeRole&&\(userOpenRole===undefined\|\|selectedRoles\.includes\(userOpenRole\)\)\?userOpenRole:activeRole/, "only the same task and active role may preserve a still-valid manual selection");
assert.match(appTemplate, /root\.__scResolvedActiveRole=activeRole/, "rerender must remember the resolved active role for the next snapshot");
assert.doesNotMatch(appTemplate, /const stateRole=/, "task state must never supply a fallback active role");
assert.match(appTemplate, /active\[0\]===\"qa\"&&\(!selectedRoles\.includes\(\"cr\"\)\|\|asObject\(details\.cr\)\.status!==\"passed\"\)/, "QA activity must require a selected, explicitly passed CR");
assertSkillMatch(/CR 未通过时 QA 保持 `pending`，不得提前进行测试准备、异常复现或测试资产修复/, "QA preparation must obey the same CR gate as formal testing");
for (const [state, label, tone] of [["paused", "已暂停", "waiting"], ["waiting", "等待中", "waiting"], ["failed", "失败", "danger"], ["cancelled", "已取消", "pending"], ["canceled", "已取消", "pending"], ["complete", "已完成", "completed"], ["done", "已完成", "completed"], ["successful", "已完成", "completed"]]) {
  assert.equal(stateText(state), label, `${state} must display its supported global state label`);
  assert.equal(stateClass(state), `sc-task-view__state--${tone}`, `${state} must use its supported global state tone`);
}
assert.equal(roleStatesLiteral, '{pending:{label:"待开始",tone:"pending"},running:{label:"进行中",tone:"active"},passed:{label:"通过",tone:"passed"},blocked:{label:"阻断",tone:"danger"},needs_user_confirm:{label:"待用户确认",tone:"waiting"}}', "one canonical metadata table must define the five role labels and tones");
assert.doesNotMatch(appTemplate, /roleStatusLabels|roleStatusTones|isActiveRoleStatus|roleStatusLabel|roleStatusTone/, "obsolete role-state helper layers must remain removed");
assert.equal(stateText("ready_for_cr"), "审查阶段", "CR phase label must not imply waiting while CR is running");
assert.equal(stateText("ready_for_qa"), "测试阶段", "QA phase label must not imply waiting while QA is running");
assert.match(appTemplate, /detailField\(body,"摘要".*detailField\(body,"必要证据".*detailField\(body,"风险"/s, "role cards retain summary, evidence and risks");
assert.doesNotMatch(appTemplate, /detailField\(body,"下一步"/, "role details must omit the next-action field on desktop and narrow screens");
assert.doesNotMatch(appTemplate, /\["下一步",data\.next\]|next:stringList\(work\.next_action\)/, "task summaries must omit the complete next-action section and its presentation data");
assert.match(appTemplate, /\[\["结果",data\.result\],\["已验证",data\.verified\],\["注意事项",data\.notes\]\]/, "task summaries retain result, verified scope and notes");
assert.match(appTemplate, /\.sc-task-view__role-subskill \{[^}]*min-height:1\.6em;[^}]*overflow:hidden;[^}]*text-overflow:ellipsis;[^}]*white-space:nowrap/, "each subskill name retains a clipped single-line row");
assert.match(appTemplate, /function selectRoleSubskills\(role,value,active\)/, "left-card subskill lists stay independent of detail DOM");
assert.match(appTemplate, /skill\.title=skill\.textContent=selectedSkill\?\.name\|\|""/, "each subskill name exposes its full value in a tooltip");
assert.match(appTemplate, /for \(const selectedSkill of skills\.length\?skills:\[null\]\)/, "unique valid names render in order with one blank row only when no records exist");
assert.match(appTemplate, /const skills=new Map\(\)/, "name deduplication preserves first valid occurrence order");
assert.match(appTemplate, /if \(running\) running\.running=true;\s*return \[\.\.\.skills\.values\(\)\];/, "the last eligible running record marks its one displayed name");
assert.doesNotMatch(appTemplate, /data-sc-field="resume_state"|data-sc-state-reference|复验入口/, "minimal UI must not render the state machine or resume_state");
assertSkillMatch(/不展示状态机、状态参考集、复验入口或 `resume_state`/, "skill must keep resume_state authoritative but out of the UI");
assertSkillDoesNotMatch(/needs_revalidation` 时必须展示 `resume_state`/, "skill must not require resume_state rendering");
assertSkillMatch(/handoffs: \[\].*权威交接记录.*不在 UI 中逐条展示/, "skill must keep handoffs authoritative but out of the minimal UI");
assertSkillDoesNotMatch(/handoffs: \[\].*每条均展示|handoffs?.*(session log|Session log|逐条展示其自身)/, "skill must not require handoff or session-log rendering");
assert.match(appTemplate, /if \(index\) \{ const connector=document\.createElement\("span"\);.*dataset\.scConnectorFrom=selectedRoles\[index-1\]; connector\.dataset\.scConnectorTo=role/s, "decorative connectors must connect roles only, without an arrow from task context");
assert.match(appTemplate, /\.sc-task-view__workspace \{ display:grid; grid-template-columns:minmax\(0,1fr\) minmax\(0,3fr\);/, "desktop workspace must place a quarter-width role lane left of its detail preview");
assert.match(appTemplate, /data-sc-workspace>[\s\S]*?data-sc-roles[\s\S]*?data-sc-role-preview/, "the role lane must precede the right-side detail preview");
assert.match(appTemplate, /details\[data-sc-role\] \{ position:relative; width:100%;/, "role cards must fill the one-quarter-width desktop role lane");
assert.match(appTemplate, /details\[data-sc-role\] > \[data-sc-detail-body\] \{ display:none; \}/, "desktop role details must render in the shared preview");
assert.match(appTemplate, /function previewRoleFor\(root\)[\s\S]*?root\.__scHoveredRole,root\.__scFocusedRole,root\.__scResolvedActiveRole/, "hover and keyboard focus must temporarily override the running-role preview");
assert.match(appTemplate, /function bindRolePreview\(root\)[\s\S]*?pointerover[\s\S]*?focusin[\s\S]*?focusout/, "role preview must respond to pointer and keyboard focus");
assert.match(appTemplate, /data-sc-preview-body tabindex="-1"/, "the independent detail region must be focusable when it has no subskill controls");
assert.doesNotMatch(appTemplate, /按 → 进入详情，Shift\+Tab 返回角色卡/, "the requested keyboard instruction must not render");
assert.match(appTemplate, /setAttribute\("aria-keyshortcuts","ArrowRight"\)/, "the keyboard route must remain available to assistive technology");
assert.match(appTemplate, /event\.key==="ArrowRight"\|\|\(event\.key==="Tab"&&!event\.shiftKey\)/, "keyboard users must have a direct route from each role card into its preview");
assert.match(appTemplate, /event\.key==="Tab"&&event\.shiftKey&&event\.target===first/, "Shift+Tab at the first preview control must return to its owning role");
assert.match(appTemplate, /onPointerOut=event=>\{ if \(lane\.contains\(event\.relatedTarget\)\) return;/, "pointer movement across the workspace gap must keep the preview stable");
assert.match(appTemplate, /\.sc-task-view__role-preview, \.sc-task-view__preview-link \{ display:none; \}[^}]*details\[data-sc-role\] > \[data-sc-detail-body\] \{ display:grid; \}/, "narrow layouts must stack cards and hide the independent detail and its link");
assert.match(appTemplate, /sc-task-view__role-preview \{[^}]*align-self:stretch;[^}]*justify-self:end; width:calc\(90% \+ 15px\)/, "the preview must preserve its right edge and expand fifteen pixels left from ninety percent");
assert.match(appTemplate, /data-sc-preview-size inert aria-hidden="true"/, "natural-size reserve copies must be inert and absent from the accessible tree");
assert.match(appTemplate, /sc-task-view__preview-size \{[^}]*visibility:hidden; pointer-events:none/, "size reserve copies must never display or intercept a pointer");
assert.match(appTemplate, /function cloneRoleDetail\(source\)/, "visible and natural-size detail copies share one clone helper");
assert.match(appTemplate, /renderPreviewSize\(root\)[\s\S]*?cloneRoleDetail\(source\)/, "size reserve copies must use the shared clone helper without preview markers");
assert.match(appTemplate, /source=root\.querySelector[\s\S]*?preview=cloneRoleDetail\(source\)/, "visible preview uses the same natural-size clone");
assert.match(appTemplate, /copy\.removeAttribute\("data-sc-detail-body"\)/, "natural-size and visible copies drop their source detail marker");
assert.match(appTemplate, /sc-task-view__preview-link \{[^}]*height:2px; background:var\(--focus\); box-shadow:0 0 4px/, "the preview owner must connect to the detail with a thin softly highlighted line");
assert.doesNotMatch(appTemplate, /sc-task-view__preview-link::after/, "the horizontal ownership line must have no arrowhead");
assert.match(appTemplate, /link\.hidden=link\.closest\("\[data-sc-role\]"\)\.dataset\.scRole!==role/, "the horizontal link must follow the preview owner");
assert.doesNotMatch(appTemplate, /details\[data-sc-role\]:hover \{[^}]*transform:/, "role hover must not move its hit target");
assert.match(appTemplate, /@keyframes sc-preview-reveal \{ from \{ opacity:0; \} to \{ opacity:1; \} \}/, "preview switching must fade without moving its content");
assertSkillMatch(/handoff_id/, "the snapshot contract must document stable optional handoff identity");

for (const tone of ["pending", "active", "completed", "passed", "danger", "waiting", "revision", "unknown"]) assert.match(appTemplate, new RegExp(`sc-task-view__state--${tone} \\{[^}]*color:`), `${tone} must define a semantic status color`);
assert.match(appTemplate, /--unknown:#fff/, "unknown and missing status text must be white");
assert.match(appTemplate, /\.sc-task-view__empty \{ color:#fff/, "empty placeholders must be white");
assert.match(appTemplate, /\.sc-task-view__placeholder \{ color:#fff/, "all missing metadata must be white");
assert.match(appTemplate, /sc-task-view__connector::before/, "role connectors must retain an explicit vertical stem");
assert.match(appTemplate, /sc-task-view__connector::after/, "role connectors must render a downward arrowhead");
assert.match(appTemplate, /sc-task-view__connector::after \{[^}]*border-top:7px solid currentColor/, "connector arrowhead must be a filled downward triangle");
assert.doesNotMatch(appTemplate, /sc-task-view__progress|role="progressbar"|任务进度：|progress-label/, "role cards must not render progress bars or percentages");
assert.match(appTemplate, /--motion-period:1\.8s;/, "persistent motion must share the approved 1.8 second period");
assert.match(appTemplate, /\.sc-task-view details\[data-sc-role\]\.is-active \{[^}]*border-color:var\(--role-accent\);[^}]*animation:sc-running-pulse var\(--motion-period\) ease-in-out infinite/, "active role cards must retain a visible persistent running animation");
assert.match(appTemplate, /@keyframes sc-running-pulse/, "the running role animation must be defined");
assert.equal(stateText("workflow_ready"), "任务完成", "workflow_ready must present completion without changing its state semantics");

console.log(skill ? "SC minimal task-flow UI contract passed." : "SC minimal task-flow UI contract passed (repository Skill checks skipped outside the source tree).");
