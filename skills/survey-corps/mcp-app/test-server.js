"use strict";
const { startServer } = require("./test-stdio-helper");
const replies = [];
const { server, complete } = startServer({ onReply: reply => { replies.push(reply); if (replies.length === 3) { verifyFileActivity(); finish(); } } });
function verifyFileActivity() {
  const assert=require("node:assert/strict"),snapshot=replies[1].result.tools[0].inputSchema.properties.snapshot,schema=snapshot.definitions.fileActivity;
  assert.deepEqual(schema.required,["current"]);
  for (const name of ["previous","current","next"]) assert.equal(schema.properties[name].type,"string");
  assert.deepEqual(replies[2].result.structuredContent.snapshot.role_details.req.file_activity,{current:"skills/req/SKILL.md",next:"AGENTS.md"});
}
function send(id, method, params) { server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`); }
function finish() { const tool=replies[1].result.tools[0],snapshot=tool.inputSchema.properties.snapshot,metrics=snapshot.definitions.metrics.properties,roleMetricRef=snapshot.definitions.roleDetail.properties.metrics.$ref,roleMetrics=snapshot.definitions[roleMetricRef.split("/").at(-1)].properties; if (replies[0].result.serverInfo.name !== "survey-corps-task-view" || replies[0].result.serverInfo.version !== "0.1.4") throw new Error("initialize failed"); if (tool._meta.ui.resourceUri !== "ui://survey-corps/task-view" || !tool._meta["openai/ui"].entrypoints.some(entry => entry.type === "thread") || replies[2].result.structuredContent.snapshot.view_id !== "sc-task-view:demo-unit" || replies[2].result.structuredContent.snapshot.work_unit.work_unit_id !== "demo-unit") throw new Error("MCP App tool result is incomplete"); if (metrics.elapsed_ms.minimum !== 0 || metrics.elapsed_ms.maximum !== Number.MAX_SAFE_INTEGER || roleMetrics.elapsed_ms.type !== "integer" || roleMetrics.elapsed_ms.maximum !== Number.MAX_SAFE_INTEGER) throw new Error("MCP App elapsed schema is incomplete"); if (replies[2].result.structuredContent.snapshot.work_unit.metrics.elapsed_ms !== 0) throw new Error("planned tasks must receive an automatic zero elapsed value"); console.log("MCP App stdio smoke test passed."); complete(); }
send(1, "initialize", { protocolVersion: "2025-11-25" });
send(2, "tools/list");
send(3, "tools/call", { name: "show_sc_task_view", arguments: { snapshot: { view_id: "sc-task-view:demo-unit", state: "planned", work_unit: { work_unit_id: "demo-unit", target: "demo", roles: ["req"], risks: [], evidence: [], verified_scope: [], unverified_scope: [] }, role_details: { req: { status:"pending", file_activity: { current:"skills/req/SKILL.md", next:"AGENTS.md" } } }, handoffs: [] } } });
