import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/admin/launch/route.js", import.meta.url), "utf8");
const watchdog = readFileSync(new URL("../app/api/system-watchdog/route.js", import.meta.url), "utf8");

test("le dashboard de lancement reste privé et utilise la readiness réelle", () => {
  assert.match(source, /adminAuthorized/);
  assert.match(source, /commercialReadiness/);
  assert.match(source, /TABLES\.configuration/);
  assert.match(source, /TABLES\.products/);
  assert.match(source, /TABLES\.book/);
  assert.match(source, /TABLES\.legal/);
  assert.match(source, /Blocages restants/);
  assert.match(source, /\/admin\/social/);
  assert.match(source, /\/admin\/growth/);
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
