"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(path.join(__dirname, "assets", "sc-task-view.html")));
const extract = name => html.match(new RegExp("      function " + name + "\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n      }"))[0];
const definitions = ["asObject", "optionalText"].map(name => html.split(/\r?\n/).find(line => line.trim().startsWith("const " + name + "="))).join("\n");
const geometry = vm.runInNewContext(extract("returnHandoffGeometry") + "\nreturnHandoffGeometry;");
const observe = vm.runInNewContext(definitions + "\n" + extract("observeHandoff") + "\nobserveHandoff;");
const lane = { left: 22, top: 100, width: 140, height: 500 };
const from = { left: 24, top: 300, width: 140, height: 80 }, to = { left: 24, top: 100, width: 140, height: 60 };
assert.equal(geometry(from, to, lane).path, "M 84 200 V 197 Q 84 194 87 194 H 95 Q 98 194 98 191 V 69 Q 98 66 95 66 H 87 Q 84 66 84 63 V 60");
assert.equal(geometry(from, to, lane).tip, "M 81 64 L 84 60 L 87 64");
for (const [width, height] of [[100, 120], [328, 480], [140, 800]]) {
  const bounds = { ...lane, width, height: height + 400 };
  const source = { ...from, width, top: 100 + height + 36 }, target = { ...to, width, height };
  const before = JSON.stringify([source, target, bounds]), result = geometry(source, target, bounds);
  assert.ok(result.path.startsWith("M " + (width / 2 + 14) + " " + (height + 36)));
  assert.ok(result.path.endsWith(" V " + height));
  assert.ok(width / 2 + 28 < width, "right return lane stays inside the role column");
  assert.ok(!/NaN|Infinity/.test(result.path));
  assert.equal(JSON.stringify([source, target, bounds]), before);
}
assert.equal(geometry(to, from, lane), null);
assert.equal(geometry(from, to, { ...lane, width: 0 }), null);
assert.equal(geometry(from, to, { ...lane, height: 0 }), null);

const input = { view_id: "sc-task-view:rounds", work_unit: { work_unit_id: "rounds" }, handoffs: [] };
const roles = ["dev", "cr", "qa"];
let observation = observe(null, input, roles, "cr");
for (const [id, source, target] of [["return-1", "cr", "dev"], ["resubmit-1", "dev", "cr"], ["return-2", "cr", "dev"]]) {
  input.handoffs.push({ handoff_id: id, from: source, to: target, work_unit_id: "rounds", handoff_result: "accepted" });
  observation = observe(observation, input, roles, target);
  assert.equal(observation.event.id, id);
  observation = observe(observation, input, roles, target);
  assert.equal(observation.event, null);
}
assert.equal(observe(null, input, roles, "dev").event, null);
console.log("SC return handoff implementation unit checks passed (rounded U geometry, dynamic heights, input immutability, unique multi-round handoffs, same-ID refresh and initial history).");
