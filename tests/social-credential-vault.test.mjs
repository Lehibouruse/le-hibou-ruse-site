import assert from "node:assert/strict";
import test from "node:test";
import { decryptSocialCredential, encryptSocialCredential, SOCIAL_VAULT_VERSION, vaultFingerprint } from "../lib/social-credential-vault.mjs";

const env = { HIBOU_SOCIAL_VAULT_KEY: Buffer.alloc(32, 7).toString("base64url") };

test("le coffre chiffre puis déchiffre un credential sans exposer le token", () => {
  const payload = { access_token: "top-secret-token", refresh_token: "refresh-secret", expires_in: 3600 };
  const encrypted = encryptSocialCredential("youtube", "primary", payload, env);
  assert.equal(encrypted.version, SOCIAL_VAULT_VERSION);
  assert.equal(encrypted.ciphertext.includes("top-secret-token"), false);
  assert.equal(encrypted.iv.length > 8, true);
  assert.deepEqual(decryptSocialCredential({
    Provider: "youtube",
    "Account key": "primary",
    Ciphertext: encrypted.ciphertext,
    IV: encrypted.iv,
    "Auth tag": encrypted.authTag,
    "Vault version": encrypted.version,
  }, env), payload);
});

test("le coffre lie cryptographiquement le provider et le compte", () => {
  const encrypted = encryptSocialCredential("tiktok", "primary", { access_token: "secret" }, env);
  assert.throws(() => decryptSocialCredential({
    Provider: "youtube",
    "Account key": "primary",
    Ciphertext: encrypted.ciphertext,
    IV: encrypted.iv,
    "Auth tag": encrypted.authTag,
    "Vault version": encrypted.version,
  }, env));
});

test("le fingerprint ne révèle pas la clé maître", () => {
  const fp = vaultFingerprint(env);
  assert.match(fp, /^[0-9a-f]{12}$/);
  assert.equal(fp.includes(env.HIBOU_SOCIAL_VAULT_KEY), false);
});
