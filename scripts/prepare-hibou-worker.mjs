import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("./hibou-worker.mjs", import.meta.url);
const source = readFileSync(path, "utf8");

if (source.includes('case "social_status":')) {
  console.log("Core social relay already present.");
  process.exit(0);
}

const before = `    case "airtable_read":\n      return api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });`;
const after = `    case "airtable_read":\n    case "social_status":\n    case "social_prepare":\n      return api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });`;

if (!source.includes(before)) {
  throw new Error("Point d'injection social du worker introuvable; arrêt sûr.");
}

writeFileSync(path, source.replace(before, after), "utf8");
console.log("Core social server tools enabled for this worker checkout.");
