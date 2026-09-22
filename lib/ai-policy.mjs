const TRUE_VALUES = new Set(["1", "true", "on", "yes"]);

function explicitTrue(value) {
  return TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

export function isProjectAiEnabled(env = process.env) {
  // Fail closed: missing variables must never reactivate a paid AI path.
  const enabled = explicitTrue(env.AI_ENABLED);
  const killSwitch = env.HIBOU_AI_KILL_SWITCH == null || env.HIBOU_AI_KILL_SWITCH === ""
    ? true
    : explicitTrue(env.HIBOU_AI_KILL_SWITCH);
  return enabled && !killSwitch;
}
