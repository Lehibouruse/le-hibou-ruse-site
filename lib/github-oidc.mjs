import { createPublicKey, verify } from "node:crypto";

const ISSUER = "https://token.actions.githubusercontent.com";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const AUDIENCE = "hibou-orchestrator";
const REPOSITORY = "Lehibouruse/le-hibou-ruse-site";

function decodePart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function audienceMatches(aud) {
  return Array.isArray(aud) ? aud.includes(AUDIENCE) : aud === AUDIENCE;
}

export async function verifyGithubActionsToken(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || typeof token !== "string") throw new Error("OIDC token absent");
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

  if (payload.iss !== ISSUER) throw new Error("OIDC issuer invalide");
  if (!audienceMatches(payload.aud)) throw new Error("OIDC audience invalide");
  if (!payload.exp || Number(payload.exp) < nowSeconds - 30) throw new Error("OIDC token expiré");
  if (payload.nbf && Number(payload.nbf) > nowSeconds + 30) throw new Error("OIDC token pas encore valide");
  if (payload.repository !== REPOSITORY) throw new Error("OIDC repository invalide");
  if (payload.ref !== "refs/heads/main") throw new Error("OIDC ref invalide");
  if (!["schedule", "workflow_dispatch"].includes(payload.event_name)) throw new Error("OIDC event invalide");

  return payload;
}

export function githubOidcAudience() {
  return AUDIENCE;
}
