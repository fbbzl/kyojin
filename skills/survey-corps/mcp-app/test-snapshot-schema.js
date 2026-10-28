"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const schema = require("./snapshot.schema.json");
const validate = require("./snapshot-validator");

const validSnapshots = [
  { view_id: "sc-task-view:legacy", state: "planned" },
  { view_id: "sc-task-view:scalar-role", state: "planned", work_unit: { roles: "dev" } },
  {
    view_id: "sc-task-view:full",
    state: "planned",
    work_unit: {
      work_unit_id: "full",
      project_mcps: ["codegraph"],
      git: { repository: "kyojin", branch: "codex/sc-json-validation" },
      roles: ["dev", "cr", "qa"],
      scope: "One feature",
      environment: ["local Node.js"],
      verified_scope: ["snapshot schema"],
      evidence: ["test output"],
      metrics: { elapsed_ms: 0, total_tokens: 0 },
    },
    role_details: {
      dev: {
        status: "pending",
        file_activity: { current: "D:/workspace/file.js" },
        subskills: [{ name: "tech-select", status: "completed", evidence: ["reviewed options"] }],
      },
    },
    handoffs: [{ from: "dev", to: "cr", handoff_result: "pending", files: ["src/app.js"] }],
    extension: { preserves: "forward compatibility" },
  },
];
for (const snapshot of validSnapshots) assert.equal(validate(snapshot), true, JSON.stringify(validate.errors));

const invalidSnapshots = [
  {},
  { view_id: " " },
  { view_id: "missing-roles", state: "planned", work_unit: {} },
  { view_id: "missing-state", work_unit: { roles: [] } },
  { view_id: "bad-role-state", role_details: { qa: { status: "done" } } },
  { view_id: "bad-role-metrics", role_details: { dev: { metrics: { elapsed_ms: -1 } } } },
  { view_id: "bad-subskill-status", role_details: { dev: { subskills: [{ name: "optimize", status: "" }] } } },
  { view_id: "bad-file", role_details: { dev: { file_activity: { current: "" } } } },
  { view_id: "bad-subskill", role_details: { dev: { subskills: [{ name: "optimize" }] } } },
  { view_id: "bad-handoff", handoffs: [{ from: "external", to: "qa" }] },
];
for (const snapshot of invalidSnapshots) assert.equal(validate(snapshot), false, JSON.stringify(snapshot));

assert.equal(schema.properties.view_id.type, "string");
assert.equal(schema.properties.work_unit.required.includes("roles"), true);
assert.equal(validate(validSnapshots[0]), true, "legacy view-only snapshots remain supported");
assert.doesNotMatch(fs.readFileSync(require.resolve("./snapshot-validator"), "utf8"), /require\(["']ajv\//, "generated validator must not load Ajv at runtime");
console.log("Snapshot schema and standalone validator contract passed.");
