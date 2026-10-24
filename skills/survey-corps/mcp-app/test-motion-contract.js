const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appTemplate = fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html"), "utf8");

assert.doesNotMatch(appTemplate, /is-entering|is-connection-entering|is-state-updated/, "mounting and ordinary state updates must not add entrance or state animations");
assert.match(appTemplate, /selectedRoles\.filter\(role=>asObject\(details\[role\]\)\.status==="running"\)/, "only exact running in the selected chain may activate role motion");
assert.doesNotMatch(appTemplate, /activeRoleStates=new Set/, "legacy aliases must not activate role cards");
assert.match(appTemplate, /--motion-period:1\.8s;/, "persistent effects must share the approved 1.8 second period");
assert.match(appTemplate, /details\[data-sc-role\]\.is-active \{[^}]*animation:sc-running-pulse var\(--motion-period\) ease-in-out infinite/, "an active role card must visibly pulse continuously using the shared period");
assert.match(appTemplate, /preview-link:not\(\[hidden\]\)::before \{[^}]*animation:sc-preview-flow var\(--motion-period\) linear infinite/, "the ownership line flow must share the period while keeping linear travel");
assert.match(appTemplate, /role-state\.is-status-running,\s*\.sc-task-view \.sc-task-view__role-subskill\.is-status-running \{[^}]*animation:sc-status-shimmer var\(--motion-period\) linear infinite/, "role state and selected running subskill must share the same shimmer rule and timing");
assert.match(appTemplate, /role-elapsed, \.sc-task-view__role-subskill \{[^}]*color:var\(--muted\)/, "subskill names retain the default muted color");
assert.match(appTemplate, /role-subskill\.is-status-running \{ background-image:linear-gradient\(100deg,var\(--muted\) 38%,var\(--text\) 47%,#fff 50%,var\(--text\) 53%,var\(--muted\) 62%\); \}/, "running name shimmer overrides only the gradient with neutral colors");
assert.match(appTemplate, /role-state\.is-status-running,[^}]*background-image:linear-gradient\(100deg,var\(--active\) 38%,var\(--focus\) 47%,#fff 50%,var\(--focus\) 53%,var\(--active\) 62%\)/, "running status retains its original blue gradient");
assert.doesNotMatch(appTemplate, /sc-task-view__preview-link::after/, "the horizontal ownership line must have no arrowhead");
assert.match(appTemplate, /@keyframes sc-running-pulse \{[^}]*box-shadow:0 0 0 1px[^}]*/s, "the active role pulse must retain a visible resting glow");
assert.match(appTemplate, /50% \{[^}]*box-shadow:0 0 0 5px[^}]*0 0 26px/s, "the active role pulse must reach a pronounced card glow");
assert.match(appTemplate, /@keyframes sc-running-pulse \{ 0%,100% \{ background-color:color-mix\(in srgb,var\(--role-accent\) 3%,var\(--panel-active\)\)/, "the low card-fill frame uses a restrained three-percent character accent");
assert.match(appTemplate, /50% \{ background-color:color-mix\(in srgb,var\(--role-accent\) 8%,var\(--panel-active\)\)/, "the high card-fill frame remains substantially weaker than the role border");
assert.doesNotMatch(appTemplate, /sc-thinking-border|details\[data-sc-role\]\.is-active::before/, "role cards must not render a rotating geometric border effect");
assert.doesNotMatch(appTemplate, /details\[data-sc-role\]::before[^}]*animation:/, "idle roles must not animate");
assert.match(appTemplate, /details\.sc-task-view__node\.is-manual-replay \{[^}]*animation:sc-manual-role/, "debug replay must be scoped to a role card");
assert.match(appTemplate, /@media \(prefers-reduced-motion:reduce\).*animation:none !important; transition:none !important;/, "reduced motion must disable animation and transitions");
assert.doesNotMatch(appTemplate, /\.sc-task-view__connector(?:::before|::after)? \{[^}]*animation:/, "idle connectors must remain static");
assert.match(appTemplate, /\.sc-task-view__connector\.is-handoff-flow::before \{[^}]*animation:sc-handoff-flow [^;]* 1 both/, "an explicitly triggered handoff must use one finite connector animation");
assert.doesNotMatch(appTemplate, /is-handoff-reverse/, "return feedback uses its own rounded path, not a reversed down arrow");
assert.match(appTemplate, /\.sc-task-view__connector \{[^}]*transform:translateX\(-12px\)/, "down arrows leave the approved return-lane clearance");
assert.match(appTemplate, /\.sc-task-view__handoff-return path \{[^}]*stroke-width:2px; stroke-linecap:round; stroke-linejoin:round/, "the return path is two-pixel rounded SVG");
assert.match(appTemplate, /handoff-return-line \{ stroke-dasharray:3 5/, "the return lane is dashed");
assert.match(appTemplate, /handoff-return-light \{ stroke-dasharray:12 100/, "only a short light segment travels along the return path");
assert.match(appTemplate, /handoff-return-light\.is-handoff-return-flow \{ animation:sc-handoff-return 650ms ease-in-out 1 both/, "each return has one finite 650ms sweep");
assert.match(appTemplate, /@keyframes sc-handoff-return \{ 0% \{ stroke-dashoffset:12;[^}]*}[^}]*} 100% \{ stroke-dashoffset:-100/, "the short light advances from the path start toward its receiver");
assert.match(appTemplate, /const finish=\(\)=>\{ observer\?\.disconnect\(\); svg\.remove\(\); }/, "return cleanup removes its SVG and disconnects its lifecycle observer");
assert.match(appTemplate, /\.is-handoff-receiving::after \{[^}]*pointer-events:none;[^}]*animation:sc-handoff-receive [^;]* 1 both/, "receiver feedback must be finite and must not intercept interaction");
assert.match(appTemplate, /\.sc-task-view__connector::before[^}]*background:currentColor/, "connector stem must follow the flow color");
assert.match(appTemplate, /\.sc-task-view__connector::after[^}]*border-top:7px solid currentColor/, "connector arrowhead must point down");
assert.match(appTemplate, /data-sc-play-animation[^>]*aria-label="播放任务视图动画"/, "task view must expose an accessible animation replay button");
assert.match(appTemplate, /button\.addEventListener\("click",onClick\)/, "animation replay button must have a click handler");
assert.match(appTemplate, /prefersReducedMotion\(\)\) return;.*animateOnce\(root\.querySelector\("details\.is-active"\),"is-manual-replay"/s, "debug replay must respect reduced motion and target only an active role");
assert.match(appTemplate, /root\.__scManualMotionCleanup\?\.\(\); root\.__scManualMotionCleanup=undefined;/, "manual replay must cancel the previous replay before starting");
assert.match(appTemplate, /\.sc-task-view__node \{[^}]*transition:box-shadow 160ms ease,transform 160ms ease/, "cards must use a short hover transition");
assert.match(appTemplate, /\.sc-task-view summary \{[^}]*transition:background-color 160ms ease/, "summaries must transition their hover state");
assert.match(appTemplate, /border-radius:6px/, "card corners must remain restrained");
assert.match(appTemplate, /\[data-sc-detail-body\]\.is-detail-revealing \{ animation:sc-detail-reveal 180ms ease-out 1;/, "detail reveal must be one finite short animation on the content body");
assert.match(appTemplate, /@keyframes sc-detail-reveal \{ from \{ opacity:0; transform:translateY\(-4px\); \} to \{ opacity:1; transform:translateY\(0\); \} \}/, "detail reveal must finish as fully visible content");
assert.match(appTemplate, /openStates\.set\(details,details\.open\)/, "detail motion must establish the initial open state before queued native toggle events");
assert.match(appTemplate, /if \(!details\.open\|\|wasOpen\|\|prefersReducedMotion\(\)\|\|!details\.checkVisibility\(\{visibilityProperty:true\}\)\) return;/, "only a new opening may reveal content, and reduced motion must stay static");
assert.match(appTemplate, /if \(event&&event\.target!==node\) return;/, "nested animation events must not end a parent's animation");

const script = appTemplate.match(/<script>([\s\S]*?)<\/script>/)[1];
let reduced = false;
const context = { window: {}, matchMedia: () => ({ matches: reduced }) };
vm.runInNewContext(script.replace(/\}\)\(\);\s*$/, "window.testDetailReveal=bindDetailReveal;})();"), context);
function eventNode() {
  const listeners = new Map(), classes = new Set();
  return {
    offsetWidth: 12,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, target = this) { [...(listeners.get(type) || [])].forEach(listener => listener({ target })); }
  };
}
function detailNode(open = false) {
  const body = eventNode();
  return { open, body, checkVisibility: () => true, matches: () => true, querySelector: () => body, contains: target => target === body };
}
const role = detailNode(true);
const root = Object.assign(eventNode(), { querySelectorAll: () => [role] });
const reveal = node => node.body.classList.contains("is-detail-revealing");
const toggle = (node, open) => { node.open = open; root.emit("toggle", node); };
context.window.testDetailReveal(root);
root.emit("toggle", role);
assert.equal(reveal(role), false, "queued initial-open toggles must stay static");
toggle(role, false); toggle(role, true);
assert.equal(reveal(role), true, "opening a previously closed role must reveal its content");
role.body.emit("animationend", {});
assert.equal(reveal(role), true, "a nested animation end must not clean the parent");
role.body.emit("animationend");
assert.equal(reveal(role), false, "the body's own end must remove its transient class");
toggle(role, false);
assert.equal(reveal(role), false, "closing the role clears its transient motion");
toggle(role, true);
role.body.emit("animationcancel");
assert.equal(reveal(role), false, "cancellation must leave ordinary visible body styles");
toggle(role, false); toggle(role, true);
context.window.testDetailReveal(root);
assert.equal(reveal(role), false, "rebinding after a snapshot must clear the prior transient animation");
root.emit("toggle", role);
assert.equal(reveal(role), false, "an unchanged open state after refresh must not replay");
reduced = true;
toggle(role, false); toggle(role, true);
assert.equal(reveal(role), false, "reduced motion must leave new openings static");
reduced = false;
root.emit("toggle", role);
assert.equal(reveal(role), false, "leaving reduced motion must not backfill an opening");

console.log("SC task view motion contract passed.");
