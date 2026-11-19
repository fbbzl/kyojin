"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { startServer } = require("./test-stdio-helper");

function readResource() {
  return new Promise((resolve, reject) => {
    const { server, complete } = startServer({
      onFailure: reject,
      onReply: reply => {
        assert.equal(reply.id, 1, "unexpected resource response");
        const html = reply.result.contents[0].text;
        complete();
        resolve(html);
      },
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "ui://survey-corps/task-view" } })}\n`);
  });
}

function runBridge(script) {
  const messages = [];
  const rendered = [];
  const listeners = {};
  const root = { hidden: true };
  const loading = { hidden: false, textContent: "" };
  const documentElement = {};
  const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const parent = { postMessage: message => messages.push(message) };
  const window = {
    parent,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    renderSurveyCorpsTaskView: (element, snapshot, { systemLocale: locale }) => {
      assert.equal(element, root);
      assert.equal(locale, systemLocale);
      root.lang = locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
      rendered.push({ snapshot, systemLocale: locale });
    },
  };
  vm.runInNewContext(script, { window, document: { documentElement, getElementById: id => id === "sc-task-view-loading" ? loading : root } });
  return { messages, rendered, documentElement, root, loading, receive: (data, source = parent) => listeners.message({ source, data }) };
}

const plain = value => JSON.parse(JSON.stringify(value));

async function main() {
  const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const html = await readResource();
  const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
  const failed = runBridge(script);
  assert.equal(failed.rendered.length, 0, "the app must not render an empty task before data arrives");
  assert.equal(failed.root.hidden, true, "the empty task view stays hidden while waiting");
  assert.equal(failed.loading.hidden, false, "the loading state stays visible while waiting");
  assert.deepEqual(plain(failed.messages[0]), {
    jsonrpc: "2.0", id: "sc-ui-init", method: "ui/initialize",
    params: {
      protocolVersion: "2026-01-26",
      appInfo: { name: "survey-corps-task-view", version: "0.1.4" },
      appCapabilities: {},
    },
  }, "ui/initialize must advertise the MCP App protocol contract");
  failed.receive({ jsonrpc: "2.0", id: "sc-ui-init", error: { code: -32602, message: "invalid params" } });
  assert.equal(failed.messages.length, 1, "initialization errors must not be acknowledged");
  failed.receive({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
  failed.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { snapshot: { view_id: "sc-task-view:empty", state: "unknown" }, empty_view: true } } });
  assert.equal(failed.rendered.length, 0, "tool results must stay blocked after initialization failure");

  const ready = runBridge(script);
  assert.equal(ready.rendered.length, 0, "initialization must wait for the first task snapshot");
  const initializeResult = locale => ({ jsonrpc: "2.0", id: "sc-ui-init", result: { protocolVersion: "2026-01-26", hostContext: { locale } } });
  ready.receive(initializeResult("zh-CN"), {});
  assert.equal(ready.rendered.length, 0, "initialization does not render task data before a snapshot arrives");
  ready.receive(initializeResult("en-GB"));
  assert.deepEqual(plain(ready.messages[1]), { jsonrpc: "2.0", method: "ui/notifications/initialized" }, "successful initialization must be acknowledged");
  ready.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { snapshot: { view_id: "sc-task-view:empty", state: "unknown" }, empty_view: true } } });
  assert.equal(ready.rendered.length, 0, "the server empty sentinel must not be rendered as task data");
  assert.equal(ready.loading.hidden, false, "the loading state remains until a real snapshot arrives");
  const firstSnapshot = { view_id: "sc-task-view:empty", state: "planned", __sc_empty_snapshot: true, empty_view: true };
  ready.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { snapshot: firstSnapshot } } });
  assert.deepEqual(plain(ready.rendered[0]), { snapshot: firstSnapshot, systemLocale }, "the first received snapshot renders immediately using the system locale");
  assert.equal(ready.root.hidden, false, "the task view appears after its first snapshot");
  assert.equal(ready.loading.hidden, true, "the loading state disappears after its first snapshot");
  assert.equal(ready.documentElement.lang, systemLocale.toLowerCase().startsWith("zh") ? "zh-CN" : "en", "document language must follow the local process locale");
  const nextSnapshot = { view_id: "sc-task-view:demo", state: "dev_in_progress", __sc_empty_snapshot: true };
  ready.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { snapshot: nextSnapshot } } });
  assert.deepEqual(plain(ready.rendered[1]), { snapshot: nextSnapshot, systemLocale }, "each later snapshot renders as soon as it arrives");
  ready.receive(initializeResult("zh-CN"));
  assert.equal(ready.rendered.length, 2, "repeated initialization cannot overwrite the initialized locale or rerender task data");
  console.log("MCP App bridge contract test passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
