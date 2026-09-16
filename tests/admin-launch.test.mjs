import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/admin/launch/route.js", import.meta.url), "utf8");
const watchdog = readFileSync(new URL("../app/api/system-watchdog/route.js", import.meta.url), "utf8");

test("le dashboard de lancement reste privé et utilise la readiness réelle", () => {
  assert.match(source, /adminAuthorized/);
  assert.match(source, /commercialReadiness/);
  assert.match(source, /commerceTestReadiness/);
  assert.match(source, /TABLES\.configuration/);
  assert.match(source, /TABLES\.products/);
  assert.match(source, /TABLES\.book/);
  assert.match(source, /TABLES\.legal/);
  assert.match(source, /Blocages restants avant vente publique/);
  assert.match(source, /\/admin\/social/);
  assert.match(source, /\/admin\/growth/);
});

test("le dashboard sépare explicitement test Lemon, test Digify et vente publique", () => {
  assert.match(source, /Lemon test/);
  assert.match(source, /Digify test/);
  assert.match(source, /Tests commerce non-live/);
  assert.match(source, /un test prêt ne vaut jamais autorisation de vendre/);
  assert.match(source, /testReadiness\.lemon/);
  assert.match(source, /testReadiness\.digify/);
});

test("les tableaux de contrôles affichent les clés réelles et non les index du tableau", () => {
  assert.match(source, /Array\.isArray\(checks\)/);
  assert.match(source, /item\?\.key/);
});

test("le dashboard privé réutilise le heartbeat au lieu de fabriquer un second état", () => {
  assert.match(source, /systemHealthHeartbeat/);
  assert.match(source, /Infrastructure réelle/);
  assert.match(source, /Watchdog/);
  assert.match(source, /OpenAI/);
  assert.match(source, /Jobs Core/);
  assert.match(source, /Commerce \/ Digify/);
  assert.match(source, /OAuth sociaux/);
  assert.match(source, /GitHub Actions/);
  assert.match(source, /Vercel/);
  assert.match(source, /Derniers événements watchdog/);
  assert.match(source, /UNKNOWN, STALE ou PENDING/);
});

test("UNKNOWN STALE et PENDING ne peuvent jamais être rendus verts", () => {
  assert.match(source, /\["ok", "success", "healthy"\]\.includes\(state\).*return "ok"/);
  assert.match(source, /return "warn"/);
  assert.match(source, /github\.vercel\.status === "failure" \? "failure"/);
  assert.match(source, /github\.vercel\.status === "success" && github\.vercel\.aligned_with_main === true \? "success"/);
});

test("le watchdog persiste un heartbeat même lorsqu'il n'a aucun incident à journaliser", () => {
  assert.match(watchdog, /persistSystemHeartbeat/);
  assert.match(watchdog, /systemHealthConfigValues/);
  assert.match(watchdog, /system_health_status/);
  assert.match(watchdog, /persisted: true/);
  const persistenceIndex = watchdog.indexOf("persistSystemHeartbeat");
  const journalIndex = watchdog.indexOf("journalSnapshot(snapshot, actions)");
  assert(persistenceIndex >= 0);
  assert(journalIndex >= 0);
});
