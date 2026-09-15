import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("./hibou-worker.mjs", import.meta.url);
let source = readFileSync(path, "utf8");

if (!source.includes("const SOCIAL_API =")) {
  source = source.replace(
    'const API = process.env.HIBOU_WORKER_URL || "https://le-hibou-ruse-site.vercel.app/api/agent-worker";',
    'const API = process.env.HIBOU_WORKER_URL || "https://le-hibou-ruse-site.vercel.app/api/agent-worker";\nconst SOCIAL_API = new URL("/api/social", API).toString();',
  );
}

if (!source.includes("async function socialApi(body)")) {
  const marker = "async function checkpoint(state, telemetry, details) {";
  const helper = `async function socialApi(body) {\n  const response = await fetch(SOCIAL_API, {\n    method: "POST",\n    headers: { Authorization: \\`Bearer \\${await oidcToken()}\\`, "Content-Type": "application/json" },\n    body: JSON.stringify(body),\n  });\n  const data = await response.json().catch(() => ({}));\n  if (!response.ok || data.ok === false) throw new Error(data.error || \\`Social API: \\${response.status}\\`);\n  return data;\n}\n\n`;
  if (!source.includes(marker)) throw new Error("Point d'injection socialApi introuvable; arrêt sûr.");
  source = source.replace(marker, `${helper}${marker}`);
}

const publishProviders = ["youtube", "instagram", "facebook", "threads", "tiktok", "linkedin", "pinterest", "x"];
const publishCases = publishProviders.map((provider) => `    case "publish_${provider}":\n      return socialApi({\n        operation: "dispatch", provider: "${provider}",\n        media_url: args.media_url, caption: args.caption, title: args.title, privacy_level: args.privacy_level,\n        cover_image_url: args.cover_image_url, board_id: args.board_id,\n        dry_run: !(jobParameters(state.job).publication_authorization === true && jobParameters(state.job).human_approved === true),\n        human_approved: jobParameters(state.job).human_approved === true,\n        idempotency_key: String(state.job.fields?.idempotency_key || \\`job:\\${state.job.fields?.job_id || state.job.id}:${provider}\\`),\n        metadata: { source_job: state.job.fields?.job_id || state.job.id, content_record_id: args.content_record_id || "" },\n      });`).join("\n");

const oldCase = `    case "airtable_read":\n      return api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });`;
const newCase = `    case "airtable_read":\n      return api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });\n    case "social_status":\n      return socialApi({ operation: "status" });\n    case "social_prepare":\n      return socialApi({ operation: "dispatch", provider: args.provider, media_url: args.media_url, caption: args.caption, title: args.title, privacy_level: args.privacy_level, dry_run: true, human_approved: false, metadata: { source_job: state.job.fields?.job_id || state.job.id } });\n${publishCases}`;

if (!source.includes('case "publish_youtube":')) {
  if (!source.includes(oldCase)) throw new Error("Point d'injection outils sociaux introuvable; arrêt sûr.");
  source = source.replace(oldCase, newCase);
}

writeFileSync(path, source, "utf8");
console.log("Core social tools route through /api/social with OIDC and server-side policy enforcement.");
