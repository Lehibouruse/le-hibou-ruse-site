import { createPublicKey, verify } from "node:crypto";

const ISSUER = "https://token.actions.githubusercontent.com";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const AUDIENCE = "hibou-orchestrator";
const REPOSITORY = "Lehibouruse/le-hibou-ruse-site";
const REF = "refs/heads/main";
const DEFAULT_WORKFLOW_FILE = "hibou-wake.yml";
const DEFAULT_ALLOWED_EVENTS = new Set(["schedule", "workflow_dispatch", "push"]);
const SCOPED_ALLOWED_EVENTS = new Set(["schedule", "workflow_dispatch"]);

function decodePart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function audienceMatches(aud) {
  return Array.isArray(aud) ? aud.includes(AUDIENCE) : aud === AUDIENCE;
}

function workflowRef(workflowFile) {
  const file = String(workflowFile ?? "").trim();
  if (!/^[A-Za-z0-9._-]+\.ya?ml$/.test(file)) throw new Error("OIDC workflow file invalide");
  return `${REPOSITORY}/.github/workflows/${file}@${REF}`;
}

function allowedWorkflowRefs(options = {}) {
  const refs = new Set();
  for (const file of options.allowedWorkflowFiles || []) refs.add(workflowRef(file));
  for (const ref of options.allowedWorkflowRefs || []) {
    const normalized = String(ref ?? "").trim();
    if (normalized) refs.add(normalized);
  }
  if (!refs.size) refs.add(workflowRef(DEFAULT_WORKFLOW_FILE));
  return refs;
}

function allowedEvents(options = {}) {
  if (Array.isArray(options.allowedEvents) && options.allowedEvents.length) {
    return new Set(options.allowedEvents.map((item) => String(item ?? "").trim()).filter(Boolean));
  }
  const routeScoped = (options.allowedWorkflowFiles || []).length > 0 || (options.allowedWorkflowRefs || []).length > 0;
  return routeScoped ? SCOPED_ALLOWED_EVENTS : DEFAULT_ALLOWED_EVENTS;
}

export function validateGithubActionsClaims(payload, nowSeconds = Math.floor(Date.now() / 1000), options = {}) {
  if (payload.iss !== ISSUER) throw new Error("OIDC issuer invalide");
  if (!audienceMatches(payload.aud)) throw new Error("OIDC audience invalide");
  if (!payload.exp || Number(payload.exp) < nowSeconds - 30) throw new Error("OIDC token expiré");
  if (!payload.iat || Number(payload.iat) > nowSeconds + 30 || Number(payload.iat) < nowSeconds - 600) throw new Error("OIDC date d'émission invalide");
  if (payload.nbf && Number(payload.nbf) > nowSeconds + 30) throw new Error("OIDC token pas encore valide");
  if (payload.repository !== REPOSITORY) throw new Error("OIDC repository invalide");
  if (payload.ref !== REF) throw new Error("OIDC ref invalide");
  if (typeof payload.sub !== "string" || !payload.sub.trim()) throw new Error("OIDC subject invalide");
  if (!allowedWorkflowRefs(options).has(payload.workflow_ref)) throw new Error("OIDC workflow invalide");
  if (!allowedEvents(options).has(payload.event_name)) throw new Error("OIDC event invalide");
  return payload;
}

export async function verifyGithubActionsToken(token, nowSecondsOrOptions = Math.floor(Date.now() / 1000), maybeOptions = {}) {
  if (!token || typeof token !== "string") throw new Error("OIDC token absent");
  const options = typeof nowSecondsOrOptions === "object" && nowSecondsOrOptions !== null
    ? nowSecondsOrOptions
    : maybeOptions;
  const nowSeconds = typeof nowSecondsOrOptions === "number"
    ? nowSecondsOrOptions
    : Math.floor(Date.now() / 1000);
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("OIDC token invalide");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodePart(encodedHeader);
  const payload = decodePart(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("OIDC algorithme invalide");

  const discoveryResponse = await fetch(DISCOVERY_URL, { cache: "force-cache" });
  if (!discoveryResponse.ok) throw new Error("OIDC discovery indisponible");
  const discovery = await discoveryResponse.json();
  if (!discovery.jwks_uri) throw new Error("OIDC jwks_uri absent");

  const keysResponse = await fetch(discovery.jwks_uri, { cache: "force-cache" });
  if (!keysResponse.ok) throw new Error("OIDC JWKS indisponible");
  const jwks = await keysResponse.json();
  const jwk = (jwks.keys || []).find((item) => item.kid === header.kid && item.kty === "RSA");
  if (!jwk) throw new Error("OIDC clé inconnue");

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signatureValid = verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!signatureValid) throw new Error("OIDC signature invalide");

  return validateGithubActionsClaims(payload, nowSeconds, options);
}

export function githubOidcAudience() {
  return AUDIENCE;
}
