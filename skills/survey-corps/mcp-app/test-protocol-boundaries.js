"use strict";
const assert = require("node:assert/strict");
const { startServer } = require("./test-stdio-helper");
const checks = [];
const { server, complete } = startServer({ onReply: reply => {
  const check = checks.shift();
  assert.ok(check, "unexpected response (possibly a notification reply)");
  check(reply);
  if (!checks.length) { console.log("MCP protocol and byte boundaries passed."); complete(); }
} });
let id = 0;
function request(method, params, check) {
  const requestId = ++id;
  checks.push(reply => { assert.equal(reply.id, requestId); check(reply); });
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
}
const call = (snapshot, check) => request("tools/call", { name: "show_sc_task_view", arguments: { snapshot } }, check);
const error = reply => assert.equal(reply.error.code, -32602);
request("ping", undefined, reply => assert.deepEqual(reply.result, {}));
const longIdBase = { jsonrpc: "2.0", id: "", method: "unknown" };
const longId = "x".repeat(256 * 1024 - Buffer.byteLength(JSON.stringify(longIdBase)));
checks.push(reply => { assert.equal(reply.id, null); assert.equal(reply.error.code, -32603); });
server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: longId, method: "unknown" }) + "\n");
call({ view_id: "stable", state: "planned" }, reply => assert.equal(reply.result.structuredContent.snapshot.view_id, "stable"));
for (const method of ["notifications/initialized", "notifications/cancelled", "unknown", "tools/call"]) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params: { name: "show_sc_task_view", arguments: { snapshot: { view_id: "ignored" } } } }) + "\n");
}
for (const state of [null, [], {}, { toString: null }, 4, false]) call({ view_id: "bad", state }, error);
request("tools/call", { name: "show_sc_task_view" }, reply => assert.equal(reply.result.structuredContent.snapshot.view_id, "stable"));
// Schema boundary: malformed known fields reject before replacing the last valid snapshot.
const invalidShapes=[{work_unit:"bad"},{work_unit:null},{work_unit:[]},{role_details:"bad"},{role_details:null},{role_details:[]}];
for(const role of ["req","dev","cr","qa"]){
  for(const value of ["bad",null,[]])invalidShapes.push({role_details:{[role]:value}});
  for(const value of ["bad",null,[]])invalidShapes.push({role_details:{[role]:{metrics:value}}},{role_details:{[role]:{file_activity:value}}});
  for(const file_activity of [{},{current:42},{current:""},{current:"x",previous:7},{current:"x",next:null}])invalidShapes.push({role_details:{[role]:{file_activity}}});
}
for(const metrics of ["bad",null,[],{elapsed_ms:-1},{elapsed_ms:1.5},{elapsed_ms:"1"},{elapsed_ms:Number.MAX_SAFE_INTEGER+1},{total_tokens:-1},{total_tokens:"1"},{extra:1}]){
  invalidShapes.push({state:"planned",work_unit:{roles:[],metrics}});
  if(metrics&&typeof metrics==="object"&&!Array.isArray(metrics))invalidShapes.push({role_details:{dev:{metrics}}});
}
for(const fields of invalidShapes){
  call({view_id:"bad-shape",...fields},error);
  request("tools/call",{name:"show_sc_task_view",arguments:{}},reply=>assert.deepEqual(reply.result.structuredContent.snapshot,{view_id:"stable",state:"planned"},"invalid types must neither enter cache nor seed elapsed"));
}
const extension={view_id:"extensions",state:"planned",custom:[1],work_unit:{roles:[],custom:true,metrics:{elapsed_ms:0,total_tokens:0}},role_details:{dev:{custom:true,file_activity:{current:"x",custom:1}},custom:"legacy"}};
call(extension,reply=>{const value=reply.result.structuredContent.snapshot;assert.deepEqual(value.custom,[1]);assert.equal(value.role_details.custom,"legacy");assert.equal(value.role_details.dev.file_activity.custom,1);assert.equal(value.work_unit.metrics.elapsed_ms,0);});
const sized = bytes => {
  const snapshot = { view_id: "boundary", summary: "中" };
  snapshot.summary += "x".repeat(bytes - Buffer.byteLength(JSON.stringify(snapshot)));
  assert.equal(Buffer.byteLength(JSON.stringify(snapshot)), bytes);
  return snapshot;
};
call(sized(200 * 1024), reply => assert.equal(Buffer.byteLength(JSON.stringify(reply.result.structuredContent.snapshot)), 200 * 1024));
call(sized(200 * 1024 + 1), reply => { error(reply); assert.match(reply.error.message, /200 KiB/); });
request("tools/list", undefined, reply => assert.equal(reply.result.tools[0].inputSchema.properties.snapshot.properties.state.type, "string"));
for (const invalid of ["{bad}", JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" })]) {
  checks.push(reply => { assert.equal(reply.id, null); assert.equal(reply.error.code, invalid === "{bad}" ? -32700 : -32600); });
  server.stdin.write(invalid + "\n");
}
const frameId = ++id;
const frame = JSON.stringify({ jsonrpc: "2.0", id: frameId, method: "ping", params: { padding: "" } });
checks.push(reply => { assert.equal(reply.id, frameId); assert.deepEqual(reply.result, {}); });
server.stdin.write(frame.replace('"padding":""', '"padding":"' + "x".repeat(256 * 1024 - Buffer.byteLength(frame)) + '"') + "\n");
checks.push(reply => assert.equal(reply.error.code, -32600));
server.stdin.write("x".repeat(256 * 1024 + 1));
server.stdin.write("discarded\n");
// The final reply also proves frame recovery and that notifications produced no replies.
request("ping", undefined, reply => assert.deepEqual(reply.result, {}));
