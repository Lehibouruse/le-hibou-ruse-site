import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRecord, queryRecords, TABLES, updateRecord } from "./airtable.js";

const VERSION = "aes-256-gcm-v1";
const PROVIDERS = new Set(["youtube", "tiktok", "meta", "instagram", "linkedin", "pinterest", "x", "threads", "reddit"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeProvider(provider) {
  const value = clean(provider).toLowerCase();
  if (!PROVIDERS.has(value)) throw new Error(`Provider OAuth non pris en charge: ${value || "vide"}`);
  return value;
}

function normalizeAccountKey(accountKey = "primary") {
  const value = clean(accountKey || "primary").toLowerCase();
  if (!/^[a-z0-9._-]{1,64}$/.test(value)) throw new Error("Account key OAuth invalide");
  return value;
}

function keyFromEnv(env = process.env) {
  const raw = clean(env.HIBOU_SOCIAL_VAULT_KEY);
  if (raw) {
    let key;
    if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
    else {
      try { key = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64"); } catch {}
    }
    if (!key || key.length !== 32) {
      throw new Error("HIBOU_SOCIAL_VAULT_KEY doit représenter exactement 32 octets");
    }
    return key;
  }
  const root = clean(env.CRON_SECRET);
  if (!root) throw new Error("HIBOU_SOCIAL_VAULT_KEY ou CRON_SECRET absent");
  return createHash("sha256").update("hibou-social-credential-vault-v1\0").update(root).digest();
}

function aad(provider, accountKey) {
  return Buffer.from(`${provider}:${accountKey}:${VERSION}`, "utf8");
}

function encode(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function decode(value) {
  return Buffer.from(clean(value), "base64url");
}

export function encryptSocialCredential(providerInput, accountKeyInput, payload, env = process.env) {
  const provider = normalizeProvider(providerInput);
  const accountKey = normalizeAccountKey(accountKeyInput);
  const key = keyFromEnv(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(provider, accountKey));
  const plaintext = Buffer.from(JSON.stringify(payload || {}), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    provider,
    accountKey,
    ciphertext: encode(ciphertext),
    iv: encode(iv),
    authTag: encode(cipher.getAuthTag()),
    version: VERSION,
  };
}

export function decryptSocialCredential(recordOrFields, env = process.env) {
  const fields = recordOrFields?.fields || recordOrFields || {};
  const provider = normalizeProvider(fields.Provider);
  const accountKey = normalizeAccountKey(fields["Account key"] || "primary");
  if (clean(fields["Vault version"]) !== VERSION) throw new Error("Version du coffre OAuth non prise en charge");
  const decipher = createDecipheriv("aes-256-gcm", keyFromEnv(env), decode(fields.IV));
  decipher.setAAD(aad(provider, accountKey));
  decipher.setAuthTag(decode(fields["Auth tag"]));
  const plaintext = Buffer.concat([
    decipher.update(decode(fields.Ciphertext)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}

async function findRecord(provider, accountKey = "primary") {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedAccount = normalizeAccountKey(accountKey);
  const records = await queryRecords(TABLES.socialCredentials, {
    filterByFormula: `AND({Provider}='${normalizedProvider}',{Account key}='${normalizedAccount}')`,
    pageSize: 2,
  });
  if (records.length > 1) throw new Error(`Plusieurs credentials OAuth pour ${normalizedProvider}/${normalizedAccount}`);
  return records[0] || null;
}

export async function storeSocialCredential({ provider, accountKey = "primary", payload, scopes = "", expiresAt = null, status = "Connected", error = "" }, env = process.env) {
  const encrypted = encryptSocialCredential(provider, accountKey, payload, env);
  const fields = {
    Provider: encrypted.provider,
    "Account key": encrypted.accountKey,
    Ciphertext: encrypted.ciphertext,
    IV: encrypted.iv,
    "Auth tag": encrypted.authTag,
    Scopes: clean(scopes),
    "Expires at": expiresAt || null,
    Status: status,
    "Updated at": new Date().toISOString(),
    "Last error": clean(error).slice(0, 4000),
    "Vault version": VERSION,
  };
  const existing = await findRecord(encrypted.provider, encrypted.accountKey);
  if (existing) {
    await updateRecord(TABLES.socialCredentials, existing.id, fields);
    return existing.id;
  }
  const created = await createRecord(TABLES.socialCredentials, fields);
  return created?.records?.[0]?.id || "";
}

export async function loadSocialCredential(provider, accountKey = "primary", env = process.env) {
  const record = await findRecord(provider, accountKey);
  if (!record) return null;
  const status = record.fields?.Status?.name || record.fields?.Status || "";
  if (status !== "Connected") return null;
  return {
    id: record.id,
    provider: record.fields.Provider,
    accountKey: record.fields["Account key"] || "primary",
    scopes: clean(record.fields.Scopes),
    expiresAt: record.fields["Expires at"] || null,
    payload: decryptSocialCredential(record, env),
  };
}

export async function socialCredentialStatuses() {
  const records = await queryRecords(TABLES.socialCredentials, { pageSize: 50 });
  return records.map((record) => ({
    provider: clean(record.fields?.Provider),
    account_key: clean(record.fields?.["Account key"] || "primary"),
    status: record.fields?.Status?.name || record.fields?.Status || "",
    scopes: clean(record.fields?.Scopes),
    expires_at: record.fields?.["Expires at"] || null,
    updated_at: record.fields?.["Updated at"] || null,
    last_error: clean(record.fields?.["Last error"]),
    vault_version: clean(record.fields?.["Vault version"]),
  }));
}

export function vaultFingerprint(env = process.env) {
  return createHash("sha256").update(keyFromEnv(env)).digest("hex").slice(0, 12);
}

export { VERSION as SOCIAL_VAULT_VERSION };
