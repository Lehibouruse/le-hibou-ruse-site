import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const runner=readFileSync(new URL("../scripts/run-weekly-backup-windows.ps1",import.meta.url),"utf8");
const installer=readFileSync(new URL("../scripts/install-backup-schedule-windows.ps1",import.meta.url),"utf8");

test("backup schedule installer is dry-run by default",()=>{
  assert.match(installer,/if \(-not \$Install -and -not \$Uninstall\)/);
  assert.match(installer,/installed = \$false/);
  assert.match(installer,/task_started = \$false/);
});

test("scheduled task stores no token or passphrase",()=>{
  assert.doesNotMatch(installer,/pat_[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(installer,/HIBOU_BACKUP_PASSPHRASE\s*=/);
  assert.match(installer,/refuse de l'enregistrer dans la tache planifiee/);
});

test("weekly runner validates backup with a restore rehearsal",()=>{
  assert.match(runner,/backup-project-local\.mjs --all/);
  assert.match(runner,/restore-rehearsal-local\.mjs/);
  assert.match(runner,/rehearsal_ok = \$true/);
  assert.match(runner,/airtable_restore_performed = \$false/);
});

test("install does not immediately start the task",()=>{
  assert.doesNotMatch(installer,/Start-ScheduledTask/);
  assert.match(installer,/Tache installee mais non lancee/);
});
