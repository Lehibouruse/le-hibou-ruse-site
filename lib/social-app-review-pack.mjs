function clean(value) { return String(value ?? "").trim(); }

const COMMON = {
  app_name: "Le Hibou Rusé",
  website: "https://d4d5d6.com",
  business_purpose: "Le Hibou Rusé is an editorial media project. The application is used only to manage social accounts owned or administered by Le Hibou Rusé: publishing its own editorial content, reading its own account/content metadata and measuring the performance of its own publications.",
  data_handling: "OAuth access and refresh tokens are encrypted at rest on the server and are not exposed to the language model, public pages, Airtable business tables or application logs. The application never asks for social-network passwords. Non-secret account identifiers, granted scope names and operational status may be stored for diagnostics. Access can be revoked by disconnecting the provider or revoking the application in the provider account settings.",
  safety: "During launch, public publication remains subject to human review. The application does not scrape private sessions, impersonate third parties, buy engagement, mass-follow accounts, or publish to accounts that Le Hibou Rusé does not own or administer.",
};

const PROVIDERS = {
  youtube: {
    label: "YouTube",
    use_case: "Upload videos to the owned Le Hibou Rusé YouTube channel, read channel/video metadata, and retrieve first-party video analytics such as views, watch time, average view duration, audience retention proxies, subscribers gained and shares.",
    permissions: "YouTube upload/management access is needed to upload owned videos. YouTube read-only and YouTube Analytics read-only access are needed to verify the authenticated channel and measure the performance of videos uploaded by Le Hibou Rusé.",
    validation: "The first API publication test is uploaded with privacyStatus=private. No public upload is used for technical validation.",
  },
  meta: {
    label: "Meta · Facebook",
    use_case: "Publish editorial content to the Facebook Page administered by Le Hibou Rusé, verify the Page identity, and retrieve first-party Page/post insights.",
    permissions: "Page listing is used to select the Page administered by Le Hibou Rusé. Page publishing permissions are used only for that Page. Page engagement and insights permissions are used to measure Le Hibou Rusé Facebook content.",
    validation: "Payloads can be prepared and dry-run without posting. Because a real Facebook post may be visible publicly, no live technical test is executed without explicit human approval.",
  },
  instagram: {
    label: "Instagram",
    use_case: "Publish editorial Reels, images and carousels to the Instagram professional account owned by Le Hibou Rusé and retrieve first-party media insights for that account.",
    permissions: "Instagram Business Login basic access identifies the owned professional account. Content-publish access is used only for Le Hibou Rusé media. Insights access measures only first-party Instagram content.",
    validation: "Payloads can be prepared and dry-run without posting. Because a real Instagram publication may be visible publicly, no live technical test is executed without explicit human approval.",
  },
  tiktok: {
    label: "TikTok",
    use_case: "Authenticate the owned Le Hibou Rusé TikTok account, upload/publish its editorial videos or photo posts, query publication status, and read performance metadata for content published by that account.",
    permissions: "Basic user information identifies the authenticated Le Hibou Rusé account. video.publish/video.upload are required for owned content publishing; video.list is required to read the account's own published content and performance metadata.",
    validation: "Before TikTok audit/approval for public Direct Post, all API publication validation is constrained to SELF_ONLY. PULL_FROM_URL media is used only from a domain/prefix verified in the TikTok developer application.",
  },
  linkedin: {
    label: "LinkedIn · organisation",
    use_case: "Publish editorial posts on the LinkedIn organization Page administered by Le Hibou Rusé and retrieve first-party organization/post analytics for that Page.",
    permissions: "Organization publishing access is used only for the Le Hibou Rusé organization. Organization administration/reporting permissions are required to verify Page administration and retrieve organization analytics. The authorizing member must have the required Page administrator role.",
    validation: "The application can validate identity, organization access and payloads without posting. A real organization post is not created solely for a technical test without explicit human approval.",
  },
  pinterest: {
    label: "Pinterest",
    use_case: "Create Pins on boards owned by the Le Hibou Rusé Pinterest account and retrieve first-party Pin analytics such as impressions, saves, Pin clicks and outbound clicks.",
    permissions: "Board read access is used to identify the target owned board; Pin write access creates Le Hibou Rusé Pins; Pin read access retrieves first-party Pin metadata and analytics.",
    validation: "Initial testing is restricted to Pinterest Trial/Sandbox behavior. Standard Access is requested only when the integration is ready for production use.",
  },
  threads: {
    label: "Threads",
    use_case: "Publish text/image/video posts to the owned Le Hibou Rusé Threads account and retrieve first-party post insights for that account.",
    permissions: "Basic account access identifies the owned Threads account, content-publish access creates its posts, and insights access measures its own post performance.",
    validation: "Payloads are dry-run first. Because a real Threads post can be public, no live technical post is created without explicit human approval.",
  },
  x: {
    label: "X",
    use_case: "If API access is explicitly approved, publish Le Hibou Rusé media/posts to its own X account and read first-party post performance metadata.",
    permissions: "tweet.write is used only for the owned account; tweet.read/users.read identify and measure that account's own content; offline access is used for token refresh where available.",
    validation: "No paid API plan, credit purchase or live test is initiated automatically. Any API cost must be approved explicitly before activation.",
  },
  snapchat: {
    label: "Snapchat",
    use_case: "Potential future server-side management of the Le Hibou Rusé Public Profile if and only if Snap grants an official product/API that supports the required organic publishing capability.",
    permissions: "No unsupported permission is requested and no session scraping or unofficial automation is used.",
    validation: "Integration remains blocked until Snap grants the relevant official product/API access.",
  },
};

function providerMap(snapshot = {}) {
  return new Map((Array.isArray(snapshot.providers) ? snapshot.providers : []).map((item) => [clean(item.provider).toLowerCase(), item]));
}

export function buildSocialAppReviewPack(snapshot = {}) {
  const current = providerMap(snapshot);
  const packs = Object.entries(PROVIDERS).map(([provider, text]) => {
    const state = current.get(provider) || {};
    const callback = clean(state.redirect_uri);
    const scopes = clean(state.scopes);
    const missingPublish = Array.isArray(state.missing_publish_scopes) ? state.missing_publish_scopes : [];
    const missingAnalytics = Array.isArray(state.missing_analytics_scopes) ? state.missing_analytics_scopes : [];
    return {
      provider,
      label: text.label,
      app_name: COMMON.app_name,
      website: COMMON.website,
      callback,
      developer_portal: clean(state.developer_portal),
      current_phase: clean(state.phase),
      current_granted_scopes: scopes,
      missing_publish_scopes: missingPublish,
      missing_analytics_scopes: missingAnalytics,
      purpose_en: `${COMMON.business_purpose}\n\nProvider-specific use case: ${text.use_case}`,
      permissions_en: text.permissions,
      validation_en: text.validation,
      data_handling_en: COMMON.data_handling,
      safety_en: COMMON.safety,
      combined_submission_en: [
        `Application: ${COMMON.app_name}`,
        `Website: ${COMMON.website}`,
        callback ? `OAuth redirect URI: ${callback}` : "",
        "",
        COMMON.business_purpose,
        "",
        `Provider-specific use case: ${text.use_case}`,
        "",
        `Why the requested permissions are needed: ${text.permissions}`,
        "",
        `Testing and validation: ${text.validation}`,
        "",
        `Data handling: ${COMMON.data_handling}`,
        "",
        `Safety and account ownership: ${COMMON.safety}`,
      ].filter((line, index, values) => line || (index > 0 && values[index - 1])).join("\n").trim(),
    };
  });
  return { generated_at: new Date().toISOString(), packs };
}
