"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const tests = ["test-server.js", "test-cr-contract.js", "test-app-bridge-contract.js", "test-thread-entrypoint-contract.js"];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sc-failure-detection-"));
const realServer = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const faults = {
  earlyExit: 'process.stdin.once("data", () => process.exit(0));',
  malformed: 'process.stdin.once("data", () => process.stdout.write("not-json\\n"));',
  silent: 'process.stdin.resume();',
  partial: realServer.replace('function send(message) {', 'function send(message) { if (global.sent) return; global.sent = true;').replace('process.stdout.write(line);', 'process.stdout.write(line, () => process.exit(0));'),
};
for (const [fault, source] of Object.entries(faults)) {
  const fixture = path.join(temp, fault);
  fs.mkdirSync(fixture);
  for (const name of [...tests, "test-stdio-helper.js", "elapsed-tracker.js", "workflow-state-machine.js", "snapshot.schema.json", "snapshot-validator.js"]) fs.copyFileSync(path.join(__dirname, name), path.join(fixture, name));
  fs.cpSync(path.join(__dirname, "assets"), path.join(fixture, "assets"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "server.js"), source);
  for (const test of tests) {
    if (fault === "partial" && test === "test-app-bridge-contract.js") continue; // This test needs only one response.
    const run = spawnSync(process.execPath, [path.join(fixture, test)], { encoding: "utf8", timeout: 8000 });
    assert.ifError(run.error);
    assert.notEqual(run.status, 0, `${test} falsely passed ${fault}`);
    const reason = fault === "silent" ? /timed out/ : fault === "malformed" ? /Unexpected token/ : /closed before|EPIPE|EOF/;
    assert.match(run.stderr, reason, `${test} must explain ${fault}`);
  }
  console.log(`Failure detection passed: ${fault}`);
}
console.log(`Fault fixtures retained at ${temp}`);
