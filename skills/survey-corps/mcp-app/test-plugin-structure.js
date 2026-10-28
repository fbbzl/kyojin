"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const repositoryRoot = path.resolve(root, "..", "..", "..");
const isSourceTree = fs.existsSync(path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"));
const plugin = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
const skillPath = path.join(root, "..", "SKILL.md");
assert.ok(!isSourceTree || fs.existsSync(skillPath), "repository Skill is missing from the source tree");
const skill = isSourceTree ? fs.readFileSync(skillPath, "utf8") : null;
assert.equal(plugin.name, "survey-corps-task-view");
assert.equal(plugin.version, "0.1.4");
assert.equal(mcp.mcpServers[plugin.name].command, "node");
assert.deepEqual(mcp.mcpServers[plugin.name].args, ["server.js"]);
assert.equal(mcp.mcpServers[plugin.name].cwd, ".");
assert.equal(plugin.mcpServers, "./.mcp.json");
assert.equal(fs.existsSync(path.resolve(root, plugin.mcpServers)), true, "manifest MCP config does not resolve inside plugin");
assert.equal(fs.existsSync(path.join(root, "assets", "sc-task-view.html")), true, "MCP App task-view asset is missing");
assert.equal(fs.existsSync(path.join(root, "snapshot.schema.json")), true, "snapshot schema is missing");
assert.equal(fs.existsSync(path.join(root, "snapshot-validator.js")), true, "standalone snapshot validator is missing");
assert.equal(fs.existsSync(path.join(root, "..", "sc-task-view.html")), false, "legacy local HTML fallback must not exist");
assert.equal(fs.existsSync(path.join(root, "..", "Prepare-ScTaskView.ps1")), false, "legacy fallback helper must not exist");
assert.equal(fs.existsSync(path.join(root, "..", "Test-Prepare-ScTaskView.ps1")), false, "legacy fallback test must not exist");
if (skill) {
  assert.match(skill, /show_sc_task_view\(snapshot\) -> ui:\/\/survey-corps\/task-view -> 宿主内嵌 iframe/, "skill must declare the single MCP App rendering path");
  assert.match(skill, /show_sc_task_view.*工具缺失.*blocked/s, "skill must block when the MCP App tool is unavailable");
  assert.doesNotMatch(skill, /Prepare-ScTaskView|create\(view_id\)|文本降级/, "skill must not retain a fallback rendering path");
  assert.match(skill, /全局 `blocked` 的合法来源包括.*P0\/P1.*未授权执行.*任务视图 MCP.*subagent/s, "skill must declare every global blocked source");
  assert.doesNotMatch(skill, /P0\/P1 或未授权执行进入 `blocked`|达到 P0\/P1 或发生未授权执行时才进入全局 `blocked`/, "skill retains the obsolete restricted blocked semantics");
  assert.match(skill, /sc-task-view:<work_unit_id>.*UI 不展示/, "skill must define view_id as a stable non-path logical identifier hidden from the UI");
}
if (isSourceTree) {
  const market = JSON.parse(fs.readFileSync(path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"), "utf8"));
  const entry = market.plugins.find(item => item.name === plugin.name);
  assert.deepEqual(entry.source, { source: "local", path: "./skills/survey-corps/mcp-app" });
  assert.deepEqual(entry.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(entry.category, "Productivity");
  assert.equal(fs.existsSync(path.resolve(repositoryRoot, entry.source.path)), true, "marketplace source does not resolve from marketplace root to plugin");
}
console.log(isSourceTree ? "MCP App-only plugin structure test passed." : "MCP App-only plugin structure test passed (repository checks skipped outside the source tree).");
