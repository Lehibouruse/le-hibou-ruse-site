# Social API matrix

Status is intentionally credential-free. Official direct APIs are the preferred path; webhook/Metricool remains a controlled fallback when direct authorization is unavailable. `social_test_mode=TRUE` and human review remain the launch safeguards.

| Provider | Preferred path | OAuth / access required | Current runtime expectation |
| --- | --- | --- | --- |
| YouTube | Direct YouTube Data API | Web OAuth client; upload permission and read permission for metrics | native video upload + metadata + metrics |
| Facebook | Direct Meta Graph API | Meta app, Page access, `pages_manage_posts`, `pages_read_engagement` | Page publishing; fallback available |
| Instagram | Direct Instagram Graph API | Meta app, linked professional account, `instagram_content_publish` plus Page permissions | Reels publishing + metrics; fallback available |
| TikTok | Direct Content Posting API | `video.publish` + `video.list`; provider audit governs public visibility | creator-info + direct post; SELF_ONLY before audit |
| LinkedIn | Direct Posts API | `w_member_social` for member; `w_organization_social` + Page role for organization | native video/member publishing; org access remains approval-dependent |
| Threads | Direct Threads API | `threads_content_publish` + `threads_manage_insights` | content publishing + metrics |
| Pinterest | Direct Pinterest API v5 | app access + `boards:read`, `pins:write`, `pins:read`; Trial/Standard tier as applicable | image/video Pins + organic analytics; sandbox by default |
| X | Direct X API | OAuth 2.0 write/read access; paid access must never be purchased without human approval | native media + post; no automatic spend |
| Snapchat | Gated | Snap Public Profile/product approval | no server-side organic publishing until access is explicitly granted |

## Grant audit

The admin-only endpoint `/api/social/oauth/grants` reports app readiness, encrypted-vault connection state, granted scopes, missing publish/analytics permissions and the next human action. It does not expose tokens, start OAuth, publish content or spend money.

The OAuth control panel remains `/admin/social`. Exact callback URLs shown there must be copied into each provider developer console. Until the custom domain is verified, use the production Vercel origin configured by `HIBOU_PUBLIC_BASE_URL`.
