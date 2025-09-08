# dtlogs-worker

Cloudflare Worker for Slack interactions.

## Rate limiting

All `/slack/*` endpoints are protected by a D1-backed rate limiter.
It tracks request attempts per user in the `request_log` table and
returns **429 Too Many Requests** when the number of attempts exceeds
the allowed threshold in the configured window.

Environment variables:

- `RATE_LIMIT_MAX` (default `5`) – maximum requests allowed per user
  within the window.
- `RATE_LIMIT_WINDOW` (default `60`) – window size in seconds.

## Deployment

Apply `schema.sql` to the D1 database and deploy with Wrangler:

```bash
wrangler d1 execute <DB_NAME> --file=schema.sql
wrangler deploy
```
