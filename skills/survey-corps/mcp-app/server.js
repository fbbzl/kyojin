#!/usr/bin/env node
"use strict";

// Minimal MCP stdio server; runtime schema validation uses generated local code.
const fs = require("node:fs");
const path = require("node:path");
const { createElapsedTracker } = require("./elapsed-tracker");
const { createWorkflowStateMachine } = require("./workflow-state-machine");

const APP_URI = "ui://survey-corps/task-view";
const APP_MIME = "text/html;profile=mcp-app";
const TEMPLATE_PATH = path.join(__dirname, "assets", "sc-task-view.html");
const MAX_FRAME_BYTES = 256 * 1024;
const MAX_SNAPSHOT_BYTES = 200 * 1024;
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-03-26", "2025-06-18", "2025-11-25"]);
const SNAPSHOT_SCHEMA = require("./snapshot.schema.json");
const ROLE_STATUSES = SNAPSHOT_SCHEMA.definitions.roleStatus.enum.join(", ");
const validateSnapshotSchema = require("./snapshot-validator");
const EMPTY_SNAPSHOT = Object.freeze({ view_id: "sc-task-view:empty", state: "unknown" });
let latestSnapshot = null;
const elapsedTracker = createElapsedTracker();
const workflowStateMachine = createWorkflowStateMachine();

function send(message) {
  const line = `${JSON.stringify(message)}\n`;
  if (Buffer.byteLength(line, "utf8") <= MAX_FRAME_BYTES) return process.stdout.write(line);
  const fallback = `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Response exceeds 256 KiB" } })}\n`;
  process.stdout.write(fallback);
}
function failure(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }
function viewResponse(id, snapshot, message) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], structuredContent: { snapshot } } };
}
function readTemplate() { return fs.readFileSync(TEMPLATE_PATH, "utf8"); }
function appHtml() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="sc-task-view-root">${readTemplate()}</main><script>(()=>{
    const root=document.getElementById("sc-task-view-root"),render=snapshot=>window.renderSurveyCorpsTaskView(root,snapshot),initId="sc-ui-init",parentWindow=window.parent;
    let ready=false;
    render({});
    window.addEventListener("message",event=>{
      if(event.source!==parentWindow)return;
      const message=event.data;
      if(!message||message.jsonrpc!=="2.0")return;
      if(message.id===initId){
        if("error" in message)return;
        if("result" in message){
          ready=true;
          parentWindow.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized"},"*");
        }
        return;
      }
      if(!ready||message.method!=="ui/notifications/tool-result")return;
      const result=message.params?.result??message.params;
      const snapshot=result?.structuredContent?.snapshot;
      if(snapshot&&typeof snapshot==="object"&&!Array.isArray(snapshot))render(snapshot);
    });
    parentWindow.postMessage({jsonrpc:"2.0",id:initId,method:"ui/initialize",params:{protocolVersion:"2026-01-26",appInfo:{name:"survey-corps-task-view",version:"0.1.4"},appCapabilities:{}}},"*");
  })();</script></body></html>`;
}
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function resource(text) { return { uri: APP_URI, mimeType: APP_MIME, text }; }
function validateSnapshot(snapshot) {
  if (!validateSnapshotSchema(snapshot)) {
    const error = validateSnapshotSchema.errors[0];
    const field = "snapshot" + error.instancePath;
    if (/^snapshot\/role_details\/[^/]+\/status$/.test(field)) return field + " must be one of: " + ROLE_STATUSES;
    if (error.keyword === "required") {
      const missing = field + "." + error.params.missingProperty;
      if (error.params.missingProperty === "state") return missing + " must be a string for a task snapshot";
      return missing + " is required";
    }
    return field + " " + error.message;
  }
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > MAX_SNAPSHOT_BYTES) return "snapshot exceeds 200 KiB";
  return null;
}
function handle(id, method, params) {
  if (method === "initialize") { const protocolVersion=params?.protocolVersion; if (!SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) return failure(id, -32602, "Unsupported protocol version"); return send({ jsonrpc: "2.0", id, result: { protocolVersion, capabilities: { tools: {}, resources: {} }, serverInfo: { name: "survey-corps-task-view", version: "0.1.4" } } }); }
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  if (method === "resources/list") return send({ jsonrpc: "2.0", id, result: { resources: [{ uri: APP_URI, name: "SC Agent Tree", description: "Survey Corps task view MCP App", mimeType: APP_MIME }] } });
  if (method === "resources/read") { if (params?.uri !== APP_URI) return failure(id, -32602, "Unknown resource URI"); return send({ jsonrpc: "2.0", id, result: { contents: [resource(appHtml())] } }); }
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: [{ name: "show_sc_task_view", title: "Open SC task view", description: "Accept a typed Survey Corps snapshot; empty call restores the latest snapshot in this session.", annotations: { readOnlyHint: true, openWorldHint: false }, inputSchema: { type: "object", additionalProperties: false, properties: { snapshot: { ...SNAPSHOT_SCHEMA, description: "Optional full snapshot, rendered as text. Omit to restore." } } }, outputSchema: { type: "object", additionalProperties: false, required: ["snapshot"], properties: { snapshot: { ...SNAPSHOT_SCHEMA, description: "Accepted snapshot; explicit empty view before first input." } } }, _meta: { ui: { resourceUri: APP_URI }, "openai/ui": { entrypoints: [{ type: "thread" }] } } }] } });
  if (method === "tools/call") {
    if (params?.name !== "show_sc_task_view") return failure(id, -32602, "unknown tool");
    const args = params.arguments;
    if (args !== undefined && !isObject(args)) return failure(id, -32602, "show_sc_task_view arguments must be an object");
    if (args && Object.keys(args).some(key => key !== "snapshot")) return failure(id, -32602, "unknown show_sc_task_view argument");
    const hasSnapshot = args && Object.hasOwn(args, "snapshot");
    if (hasSnapshot) {
      const snapshotError = validateSnapshot(args.snapshot);
      if (snapshotError) return failure(id, -32602, snapshotError);
    }
    const message = hasSnapshot ? "SC Agent Tree 已更新。" : latestSnapshot ? "SC Agent Tree 已恢复。" : "SC Agent Tree 尚未收到任务快照。";
    let snapshot, frameExceeded = false;
    const acceptSnapshot = candidate => {
      if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_SNAPSHOT_BYTES) return false;
      frameExceeded = Buffer.byteLength(`${JSON.stringify(viewResponse(id, candidate, message))}\n`, "utf8") > MAX_FRAME_BYTES;
      return !frameExceeded;
    };
    try {
      const applySnapshot = () => elapsedTracker.update(hasSnapshot ? args.snapshot : latestSnapshot || EMPTY_SNAPSHOT, acceptSnapshot);
      if (hasSnapshot) {
        const result = workflowStateMachine.dispatch({ type: "SNAPSHOT_RECEIVED", snapshot: args.snapshot }, applySnapshot);
        if (result.error) return failure(id, -32602, result.error);
        snapshot = result.value;
      } else snapshot = applySnapshot();
    }
    catch (error) {
      if (error instanceof RangeError) return failure(id, -32000, error.message);
      throw error;
    }
    if (!snapshot) return failure(id, frameExceeded ? -32603 : -32602, frameExceeded ? "Response exceeds 256 KiB" : "snapshot exceeds 200 KiB after adding elapsed time");
    if (hasSnapshot) latestSnapshot = snapshot;
    return send(viewResponse(id, snapshot, message));
  }
  failure(id, -32601, `Method not found: ${method}`);
}
let frame=Buffer.alloc(0),discard=false;
function consume(line) {
  let request;
  try { request = JSON.parse(line.toString("utf8")); }
  catch { return failure(null, -32700, "Parse error"); }
  const hasId = isObject(request) && Object.hasOwn(request, "id");
  const validId = hasId && (request.id === null || typeof request.id === "string" || (typeof request.id === "number" && Number.isFinite(request.id)));
  if (!isObject(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string" || (hasId && !validId)) {
    return failure(validId ? request.id : null, -32600, "Invalid request");
  }
  // Notifications never execute request-only tools or produce a response.
  if (!hasId) return;
  if (Object.hasOwn(request, "params") && !isObject(request.params)) return failure(request.id, -32602, "params must be an object");
  try { handle(request.id, request.method, request.params); }
  catch { failure(request.id, -32603, "Internal error"); }
}
process.stdin.on("data",chunk=>{ let offset=0; while(offset<chunk.length){ const newline=chunk.indexOf(10,offset); const end=newline<0?chunk.length:newline; const part=chunk.subarray(offset,end); offset=newline<0?chunk.length:newline+1; if(discard){ if(newline>=0) discard=false; continue; } if(frame.length+part.length>MAX_FRAME_BYTES){ frame=Buffer.alloc(0); discard=newline<0; failure(null,-32600,"Request frame exceeds 256 KiB"); continue; } frame=Buffer.concat([frame,part]); if(newline>=0){ const line=frame; frame=Buffer.alloc(0); consume(line); } } });
