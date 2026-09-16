const ORDER = ["meta", "youtube", "threads", "tiktok", "pinterest", "linkedin", "x", "snapchat"];

function clean(value) { return String(value ?? "").trim(); }

function stepState(provider = {}) {
  const phase = clean(provider.phase);
  if (phase === "AUTHORIZED") return "DONE";
  if (phase === "HUMAN_OAUTH_APPROVAL_REQUIRED") return "READY_FOR_USER";
  if (phase === "PUBLISH_SCOPE_REVIEW_REQUIRED" || phase === "ANALYTICS_SCOPE_REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  if (phase.startsWith("EXTERNAL_")) return "EXTERNAL_SETUP_REQUIRED";
  return "SETUP_REQUIRED";
}

function routePriority(provider) {
  const index = ORDER.indexOf(clean(provider.provider).toLowerCase());
  return index >= 0 ? index : 999;
}

export function buildSocialAuthorizationQueue(snapshot = {}) {
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  const steps = providers.map((provider) => {
    const state = stepState(provider);
    const oauthReady = provider.ready_for_human_approval === true || state === "READY_FOR_USER";
    return {
      provider: clean(provider.provider).toLowerCase(),
      label: clean(provider.label || provider.provider),
      state,
      phase: clean(provider.phase),
      completed: state === "DONE",
      ready_for_user: oauthReady,
      server_env_ready: provider.server_env_ready === true,
      credential_connected: provider.credential_connected === true,
      publish_scope_ok: provider.publish_scope_ok === true,
      analytics_scope_ok: provider.analytics_scope_ok === true,
      developer_portal: clean(provider.developer_portal),
      oauth_start_path: clean(provider.oauth_start_path),
      callback: clean(provider.redirect_uri),
      required_env_names: Array.isArray(provider.required_env_names) ? provider.required_env_names : [],
      missing_env_names: Array.isArray(provider.missing_env_names) ? provider.missing_env_names : [],
      external_blocker: clean(provider.external_blocker),
      instruction: clean(provider.authorization_session_step || provider.human_action),
      human_action: clean(provider.human_action),
      networks_covered: Array.isArray(provider.airtable_platforms) ? provider.airtable_platforms : [],
    };
  }).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.ready_for_user !== b.ready_for_user) return a.ready_for_user ? -1 : 1;
    return routePriority(a) - routePriority(b);
  });

  const next = steps.find((item) => !item.completed) || null;
  return {
    generated_at: new Date().toISOString(),
    next,
    steps,
    summary: {
      total: steps.length,
      completed: steps.filter((item) => item.completed).length,
      ready_for_user: steps.filter((item) => item.ready_for_user && !item.completed).length,
      external_setup_required: steps.filter((item) => item.state === "EXTERNAL_SETUP_REQUIRED").length,
      review_required: steps.filter((item) => item.state === "REVIEW_REQUIRED").length,
    },
  };
}
