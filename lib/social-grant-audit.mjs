const REQUIREMENTS = {
  reddit: {
    label: "Reddit",
    publish_all: ["submit"],
    analytics_all: ["identity", "read"],
    blocker: "Autorisation explicite Reddit pour usage commercial requise avant OAuth, lecture ou publication. Publication limitée aux contenus originaux du Hibou et aux communautés explicitement configurées.",
  },
  youtube: {
    label: "YouTube",
    publish_any: ["https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtube.upload"],
    analytics_all: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"],
    blocker: "Client OAuth Web + YouTube Data API v3 + YouTube Analytics API + consentement du propriétaire de la chaîne. Les métriques de rétention exigent youtube.readonly et yt-analytics.readonly.",
  },
  instagram: {
    label: "Instagram",
    publish_all: ["instagram_business_content_publish"],
    analytics_all: ["instagram_business_manage_insights"],
    blocker: "Instagram Business Login configuré avec instagram_business_basic, instagram_business_content_publish et instagram_business_manage_insights.",
  },
  meta: {
    label: "Meta · Facebook",
    publish_all: ["pages_manage_posts"],
    analytics_all: ["pages_read_engagement", "read_insights"],
    blocker: "App Meta Facebook Pages configurée avec pages_show_list, pages_manage_posts, pages_read_engagement et read_insights. Instagram est autorisé séparément via Instagram Business Login.",
  },
  tiktok: {
    label: "TikTok",
    publish_all: ["video.publish"], analytics_all: ["video.list"],
    blocker: "Content Posting API et video.publish approuvé; avant audit, publication directe limitée à SELF_ONLY.",
  },
  linkedin: {
    label: "LinkedIn", publish_any: ["w_member_social", "w_organization_social"], analytics_any: ["r_member_postAnalytics", "r_organization_social"],
    blocker: "w_member_social pour le profil; w_organization_social + rôle de Page pour publier au nom d’une organisation. Analytics avancées nécessitent l’accès approprié.",
  },
  pinterest: {
    label: "Pinterest", publish_all: ["boards:read", "pins:write"], analytics_all: ["pins:read"],
    blocker: "App Pinterest + accès Trial/Standard; le callback doit correspondre exactement à celui enregistré.",
  },
  x: {
    label: "X", publish_all: ["tweet.write"], analytics_all: ["tweet.read"],
    blocker: "App X OAuth 2.0 avec accès écriture. Ne jamais activer un plan payant ou une dépense sans validation humaine explicite.",
  },
  threads: {
    label: "Threads", publish_all: ["threads_content_publish"], analytics_all: ["threads_manage_insights"],
    blocker: "App Threads Meta + consentement threads_basic/threads_content_publish/threads_manage_insights.",
  },
  snapchat: {
    label: "Snapchat", manual_only: true,
    blocker: "Publication organique serveur conditionnée à l’accès produit/approbation Snap Public Profile API.",
  },
};

const LINKEDIN_ORGANIZATION_REQUIREMENT = {
  label: "LinkedIn · organisation",
  publish_all: ["w_organization_social"], analytics_all: ["rw_organization_admin"],
  blocker: "Le Hibou publie au nom d’une organisation LinkedIn : Community Management API, w_organization_social et rw_organization_admin sont requis, avec un membre ayant le rôle de Page approprié (ADMINISTRATOR pour le reporting).",
};

function clean(value) { return String(value ?? "").trim(); }

export function scopeSet(scopes = "") {
  return new Set(clean(scopes).split(/[\s,]+/).map((item) => item.trim()).filter(Boolean));
}
function allGranted(granted, required = []) { return required.every((scope) => granted.has(scope)); }
function anyGranted(granted, required = []) { return required.length === 0 || required.some((scope) => granted.has(scope)); }
function checkGrant(granted, requirement, kind) {
  const all = requirement?.[`${kind}_all`] || [];
  const any = requirement?.[`${kind}_any`] || [];
  const missingAll = all.filter((scope) => !granted.has(scope));
  const anyOk = anyGranted(granted, any);
  return { ok: missingAll.length === 0 && anyOk, missing: [...missingAll, ...(!anyOk && any.length ? [`one_of:${any.join("|")}`] : [])] };
}
function effectiveRequirement(provider, requirement, env = process.env, app = {}) {
  if (provider !== "linkedin") return requirement;
  const configuredScopes = scopeSet(app?.scopes || env?.LINKEDIN_OAUTH_SCOPES || "");
  const organizationMode = clean(env?.LINKEDIN_ORGANIZATION_URN) || configuredScopes.has("w_organization_social") || configuredScopes.has("rw_organization_admin");
  return organizationMode ? LINKEDIN_ORGANIZATION_REQUIREMENT : requirement;
}

export function auditSocialGrants(readiness = [], credentials = [], env = process.env) {
  const readinessMap = new Map(readiness.map((item) => [clean(item.provider).toLowerCase(), item]));
  const credentialMap = new Map(credentials.map((item) => [clean(item.provider).toLowerCase(), item]));
  return Object.entries(REQUIREMENTS).map(([provider, baseRequirement]) => {
    const app = readinessMap.get(provider) || {};
    const requirement = effectiveRequirement(provider, baseRequirement, env, app);
    if (requirement.manual_only) {
      return {
        provider, label: requirement.label, app_ready: false, credential_connected: false, credential_status: "",
        publish_scope_ok: false, analytics_scope_ok: false, authorization_ready: false, fully_ready: false,
        missing_publish_scopes: [], missing_analytics_scopes: [], scopes: "", blocker: requirement.blocker,
        next_action: requirement.blocker, manual_only: true,
      };
    }

    const credential = credentialMap.get(provider) || {};
    const credentialStatus = clean(credential.status);
    const appReady = app.ready === true;
    const connected = credentialStatus.toLowerCase() === "connected";
    const needsReauth = credentialStatus.toLowerCase() === "needs reauth";
    const granted = scopeSet(credential.scopes);
    const publish = checkGrant(granted, requirement, "publish");
    const analytics = checkGrant(granted, requirement, "analytics");
    const authorizationReady = appReady && connected && publish.ok;
    const fullyReady = authorizationReady && analytics.ok;

    let nextAction = "Aucune action OAuth immédiate.";
    if (!appReady) nextAction = clean(app.error) || "Configurer l’app développeur et ses secrets serveur.";
    else if (needsReauth) nextAction = `Reconnecter OAuth depuis /admin/social. Le jeton précédent doit être renouvelé${clean(credential.last_error) ? ` : ${clean(credential.last_error)}` : "."}`;
    else if (!connected) nextAction = "Terminer le consentement OAuth depuis /admin/social.";
    else if (!publish.ok) nextAction = `Reconnecter OAuth avec les droits de publication manquants: ${publish.missing.join(", ")}.`;
    else if (!analytics.ok) nextAction = `Reconnecter/faire approuver les droits analytics manquants: ${analytics.missing.join(", ")}.`;

    return {
      provider, label: requirement.label, app_ready: appReady, credential_connected: connected,
      credential_status: credentialStatus, credential_needs_reauth: needsReauth,
      publish_scope_ok: publish.ok, analytics_scope_ok: analytics.ok, authorization_ready: authorizationReady, fully_ready: fullyReady,
      missing_publish_scopes: publish.missing, missing_analytics_scopes: analytics.missing,
      scopes: clean(credential.scopes), expires_at: credential.expires_at || null, last_error: clean(credential.last_error),
      redirect_uri: clean(app.redirect_uri), blocker: requirement.blocker, next_action: nextAction, manual_only: false,
    };
  });
}

export function socialGrantSummary(audit = []) {
  const oauth = audit.filter((item) => !item.manual_only);
  return {
    providers_total: audit.length,
    oauth_providers: oauth.length,
    apps_ready: oauth.filter((item) => item.app_ready).length,
    oauth_connected: oauth.filter((item) => item.credential_connected).length,
    oauth_reauth_required: oauth.filter((item) => item.credential_needs_reauth).length,
    publish_authorized: oauth.filter((item) => item.authorization_ready).length,
    fully_authorized_with_analytics: oauth.filter((item) => item.fully_ready).length,
    manual_only: audit.filter((item) => item.manual_only).map((item) => item.provider),
  };
}

export { REQUIREMENTS as SOCIAL_GRANT_REQUIREMENTS, LINKEDIN_ORGANIZATION_REQUIREMENT };
