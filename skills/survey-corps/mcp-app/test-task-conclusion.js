"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "assets", "sc-task-view.html"), "utf8");
const schema = JSON.parse(fs.readFileSync(path.join(root, "snapshot.schema.json"), "utf8"));

assert.equal(schema.properties.work_unit.properties.execution_finished.type, "boolean");
assert.match(html, /finishedStatuses\.has\(normalizedStatus\(state\)\)\|\|asObject\(work\)\.execution_finished===true/);
assert.match(html, /if \(root\.__scSummaryInPreview\) return null;/);
assert.match(html, /const result=data\.result\|\|root\.__scConclusionFallback/);

console.log("Task conclusion behavior contract passed.");
