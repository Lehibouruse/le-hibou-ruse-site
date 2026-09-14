# Social API matrix

Status is intentionally credential-free.

| Provider | Preferred path | Current runtime expectation |
| --- | --- | --- |
| YouTube | Existing Pipedream first, direct API when OAuth refresh credentials are configured | upload + metadata |
| Facebook | Existing Pipedream first, direct Graph API when page token/id are configured | page publishing |
| Instagram | Direct Graph API target; Metricool fallback during migration | reels publishing |
| TikTok | Direct Content Posting API target; Metricool fallback | creator-info + direct post |
| LinkedIn | Existing Pipedream first, direct Posts API when token/author are configured | member/org posts |
| Threads | Direct Threads API target | content publishing |
| X | Direct X API target for text; media path requires upload support | posts |
| Snapchat | Keep gated until Public Profile API access is approved | public profile publishing |
