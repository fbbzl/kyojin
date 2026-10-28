"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv");
const standaloneCode = require("ajv/dist/standalone").default;

const schemaPath = path.join(__dirname, "snapshot.schema.json");
const validatorPath = path.join(__dirname, "snapshot-validator.js");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true, code: { source: true }, strict: true, strictRequired: false });
const validateSnapshot = ajv.compile(schema);
const output = standaloneCode(ajv, validateSnapshot).replace(
  'const func2 = require("ajv/dist/runtime/ucs2length").default;',
  "const func2 = value => [...value].length;",
);
if (output.includes('require("ajv/')) throw new Error("Generated validator has an unexpected Ajv runtime dependency");

if (process.argv.includes("--check")) {
  const current = fs.existsSync(validatorPath) ? fs.readFileSync(validatorPath, "utf8") : "";
  if (current !== output) {
    console.error("snapshot-validator.js is stale; run pnpm build:snapshot-validator.");
    process.exitCode = 1;
  } else console.log("Snapshot validator matches snapshot.schema.json.");
} else {
  fs.writeFileSync(validatorPath, output, "utf8");
  console.log("Generated snapshot validator from snapshot.schema.json.");
}
