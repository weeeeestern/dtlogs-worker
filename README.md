# dtlogs-worker

Cloudflare Worker for Slack interactions.

## Slack setup

Configure three slash commands pointing to the deployed worker:

- `/카테고리` → `https://dtlogs.weeeeestern.workers.dev/slack/category`
- `/정리` → `https://dtlogs.weeeeestern.workers.dev/slack/summary`
- `/초기화` → `https://dtlogs.weeeeestern.workers.dev/slack/reset`

## Secrets

Set the following secrets in the worker environment (values omitted):

```
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
CHANNEL_ID

GITHUB_TOKEN
GITHUB_OWNER=weeeeestern
GITHUB_REPO=daily-tech-logs
GITHUB_DEFAULT_BRANCH=develop

GEMINI_API_KEY
LLM_MODEL_KEYWORDS=gemini-1.5-flash

TAVILY_API_KEY
ALLOWED_SITES
DAYS_LIMIT=1460
LANG_THRESHOLD=0.9
```

`ALLOWED_SITES` is optional; if omitted a default list of well known
company engineering blogs (Netflix, Uber, Dropbox, Airbnb, Stripe,
Google Cloud, AWS, Spotify, Meta, Cloudflare, LinkedIn, Slack, Shopify,
MongoDB and Salesforce) will be used.

The worker prefers posts containing deep‑dive keywords and 1k‑3k words
but will fall back to the first sufficiently long English article when
no deep‑dive match is found.

## Deployment

Apply `schema.sql` to the D1 database and deploy with Wrangler:

```bash
wrangler d1 execute <DB_NAME> --file=schema.sql
wrangler deploy
```
