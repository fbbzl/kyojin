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
  const root = {};
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
  vm.runInNewContext(script, { window, document: { documentElement, getElementById: () => root } });
  return { messages, rendered, documentElement, receive: (data, source = parent) => listeners.message({ source, data }) };
}

const plain = value => JSON.parse(JSON.stringify(value));

async function main() {
  const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const html = await readResource();
  const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
  const failed = runBridge(script);
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
  failed.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { snapshot: { view_id: "ignored" } } } });
  assert.equal(failed.rendered.length, 1, "tool results must stay blocked after initialization failure");

  const ready = runBridge(script);
  assert.equal(ready.rendered[0].systemLocale, systemLocale, "the renderer receives the local process locale");
  const initializeResult = locale => ({ jsonrpc: "2.0", id: "sc-ui-init", result: { protocolVersion: "2026-01-26", hostContext: { locale } } });
  ready.receive(initializeResult("zh-CN"), {});
  assert.equal(ready.rendered.length, 1, "initialization does not rerender before acknowledgement");
  ready.receive(initializeResult("en-GB"));
  assert.deepEqual(plain(ready.messages[1]), { jsonrpc: "2.0", method: "ui/notifications/initialized" }, "successful initialization must be acknowledged");
  ready.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { snapshot: { view_id: "sc-task-view:demo" } } } });
  assert.deepEqual(plain(ready.rendered[1]), { snapshot: {}, systemLocale }, "host initialization must not override the system locale");
  assert.equal(ready.documentElement.lang, systemLocale.toLowerCase().startsWith("zh") ? "zh-CN" : "en", "document language must follow the local process locale");
  ready.receive(initializeResult("zh-CN"));
  assert.deepEqual(plain(ready.rendered[2]), { snapshot: { view_id: "sc-task-view:demo" }, systemLocale }, "tool results must keep using the local process locale");
  assert.equal(ready.rendered.length, 3, "repeated initialization cannot overwrite the initialized locale");
  console.log("MCP App bridge contract test passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
