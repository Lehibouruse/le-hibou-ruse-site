# API surface security audit

`npm run security:api-surface` scans every `app/api/**/route.*` file and classifies it using static markers:

- `protected`: admin/service/OIDC/bearer/cron authentication detected;
- `signed_webhook`: webhook signature/HMAC verification detected;
- `public_guarded`: public browser endpoint with origin/body-size style guards;
- `oauth_public_flow`: OAuth/state flow;
- `public_read`: read-only GET without mutation marker;
- `needs_review`: no recognized guard pattern.

The tool **does not claim that a public route is vulnerable** and does not make network requests. It exists to keep an inventory and highlight routes that deserve manual review.

Strict mode:

```bash
npm run security:api-surface:strict
```

Strict mode exits non-zero when any route remains `needs_review`. It is intentionally not part of CI until the initial inventory has been reviewed and intentional public routes have explicit controls or documented exceptions.
