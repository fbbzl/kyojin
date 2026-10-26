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
assert.match(appTemplate, /\.sc-task-view__status \{[^}]*padding:6px 12px;[^}]*line-height:31[.]2px/, "the unframed status must retain its 43.2px layout height");
assert.doesNotMatch(appTemplate, /sc-status-tear|status-outgoing|__scStatus|data-sc-state-label|[.]sc-task-view__status::(?:before|after)/, "the global status must retain no calendar decoration, animation or transition lifecycle");
assert.match(appTemplate, /\.sc-task-view__role-ripple-clip \{[^}]*position:absolute;[^}]*overflow:hidden; border-radius:inherit; pointer-events:none/, "the ripple must clip inside an independent non-intercepting rounded layer");
assert.match(appTemplate, /\.sc-task-view__role-ripple \{[^}]*border-radius:50%; background:var\(--focus\);[^}]*animation:sc-role-ripple 500ms ease-out 1 both/, "click feedback must be one finite pale blue filled circle");
assert.match(appTemplate, /@keyframes sc-role-ripple \{ from \{ opacity:[.]24;[^}]*scale\(0\); \} to \{ opacity:0;[^}]*scale\(1\); \} \}/, "the circle expands from its origin and fades completely");
assert.doesNotMatch(appTemplate, /details\[data-sc-role\] > summary \{[^}]*overflow:hidden/, "ripple clipping must not cut off the summary ownership line");
assert.doesNotMatch(appTemplate, /sc-thinking-border|details\[data-sc-role\]\.is-active::before/, "role cards must not render a rotating geometric border effect");
assert.doesNotMatch(appTemplate, /details\[data-sc-role\]::before[^}]*animation:/, "idle roles must not animate");
assert.match(appTemplate, /details\.sc-task-view__node\.is-manual-replay \{[^}]*animation:sc-manual-role/, "debug replay must be scoped to a role card");
assert.match(appTemplate, /@media \(prefers-reduced-motion:reduce\).*animation:none !important; transition:none !important;/, "reduced motion must disable animation and transitions");
assert.doesNotMatch(appTemplate, /\.sc-task-view__connector(?:::before|::after)? \{[^}]*animation:/, "idle connectors must remain static");
assert.match(appTemplate, /\.sc-task-view__connector\.is-handoff-flow::before \{[^}]*animation:sc-handoff-flow [^;]* 1 both/, "an explicitly triggered handoff must use one finite connector animation");
assert.match(appTemplate, /\.sc-task-view__connector\.is-handoff-reverse::before \{[^}]*animation-direction:reverse/, "return handoffs must reverse their travel direction");
assert.match(appTemplate, /\.sc-task-view__connector\.is-handoff-reverse::after \{[^}]*border-top:0; border-bottom:7px solid currentColor/, "return handoffs must use a filled upward triangle");
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
function motionNode() {
  const listeners = new Map(), attributes = new Map();
  let classes = new Set();
  const node = {
    dataset: {},
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
    },
    set className(value) { classes = new Set(value.split(/\s+/).filter(Boolean)); },
    get className() { return [...classes].join(" "); },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name) ?? null,
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type) { [...(listeners.get(type) || [])].forEach(listener => listener({ target: node })); },
    remove() { node.removed = true; },
    offsetWidth: 1,
  };
  return node;
}
const context = { window: {}, document: { createElement: motionNode }, matchMedia: () => ({ matches: reduced }) };
vm.runInNewContext(script.replace(/\}\)\(\);\s*$/, "window.testDetailReveal=bindDetailReveal;window.testRoleRipple=bindRoleRipple;})();"), context);
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

function rippleElement() {
  const node = motionNode();
  node.style = {};
  node.children = [];
  node.append = child => node.children.push(child);
  return node;
}
context.document.createElement = rippleElement;
const clickListeners = new Set();
const rippleRoot = {
  addEventListener: (type, listener) => { if (type === "click") clickListeners.add(listener); },
  removeEventListener: (type, listener) => clickListeners.delete(listener),
  contains: node => summaries.includes(node),
};
const summaries = [0, 1].map(() => ({
  children: [],
  getBoundingClientRect: () => ({ left: 100, top: 200, width: 120, height: 80 }),
  append(node) { this.children.push(node); },
}));
const clickSummary = (summary, detail = 1, clientX = 125, clientY = 217) => {
  const event = { target: { closest: () => summary }, detail, clientX, clientY };
  clickListeners.forEach(listener => listener(event));
};
const activeRipples = () => summaries.flatMap(summary => summary.children.filter(clip => !clip.removed));
reduced = false;
context.window.testRoleRipple(rippleRoot);
context.window.testRoleRipple(rippleRoot);
assert.equal(clickListeners.size, 1, "rerender must not duplicate delegated click listeners");
clickSummary(summaries[0]);
let clip = activeRipples()[0], wave = clip.children[0];
assert.equal(clip.getAttribute("aria-hidden"), "true", "visual feedback must be absent from the accessible tree");
assert.equal(wave.style.left, "25px", "pointer origin uses the actual local click x coordinate");
assert.equal(wave.style.top, "17px", "pointer origin uses the actual local click y coordinate");
assert.equal(wave.style.width, `${2 * Math.hypot(95, 63)}px`, "diameter reaches the furthest summary corner");
assert.equal(wave.style.height, wave.style.width, "the wave is circular");
clickSummary(summaries[1], 0, 0, 0);
assert.equal(clip.removed, true, "rapid cross-card clicks remove the previous wave");
assert.equal(activeRipples().length, 1, "only the latest wave is retained");
clip = activeRipples()[0]; wave = clip.children[0];
assert.equal(wave.style.left, "60px", "keyboard activation uses the horizontal center");
assert.equal(wave.style.top, "40px", "keyboard activation uses the vertical center");
wave.emit("animationend");
assert.equal(activeRipples().length, 0, "animation end removes the entire transient layer");
clickSummary(summaries[0]);
activeRipples()[0].children[0].emit("animationcancel");
assert.equal(activeRipples().length, 0, "animation cancellation cleans the transient layer");
clickSummary(summaries[0]);
context.window.testRoleRipple(rippleRoot);
assert.equal(activeRipples().length, 0, "a snapshot rerender clears the in-flight wave");
assert.equal(clickListeners.size, 1, "snapshot cleanup keeps exactly one delegated listener");
clickSummary(null);
assert.equal(activeRipples().length, 0, "clicks outside role summaries stay unchanged");
reduced = true;
clickSummary(summaries[0]);
assert.equal(activeRipples().length, 0, "reduced motion must not create a wave layer");
rippleRoot.__scRoleRippleCleanup();
assert.equal(clickListeners.size, 0, "lifecycle cleanup removes the delegated listener");

console.log("SC task view motion contract passed.");
