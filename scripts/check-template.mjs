// Smallest check that fails if template logic breaks:
//   node --experimental-strip-types scripts/check-template.mjs
import { strict as assert } from "node:assert";
import { fillTemplate, missingVariables } from "../src/lib/template.ts";

const tpl = "Dear {{employee_name}}, your salary is PHP {{salary}} at {{company_name}}. {{salary}} again.";

assert.equal(
  fillTemplate(tpl, { employee_name: "Juan Dela Cruz", salary: "18,000", company_name: "Demo SME" }),
  "Dear Juan Dela Cruz, your salary is PHP 18,000 at Demo SME. 18,000 again."
);
// missing / empty vars become visible placeholders, never silently blank
assert.equal(fillTemplate("Hi {{name}}", {}), "Hi [NAME]");
assert.equal(fillTemplate("Hi {{name}}", { name: "" }), "Hi [NAME]");
// missingVariables dedupes and ignores provided keys
assert.deepEqual(missingVariables(tpl, { employee_name: "x" }), ["salary", "company_name"]);
assert.deepEqual(missingVariables(tpl, { employee_name: "x", salary: "1", company_name: "c" }), []);

console.log("template checks passed");
