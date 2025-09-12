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
MIN_WORDS=1000
MAX_WORDS=4000
```

`ALLOWED_SITES` is prepopulated with domains from a wide range of English
corporate engineering blogs (Spotify, Netflix, Uber, Airbnb, Shopify, Slack,
Cloudflare, Google, AWS, Microsoft, Spring, GitHub, LinkedIn, Meta, Confluent,
HashiCorp, Databricks, Grafana, Datadog, Elastic, Kubernetes, Istio, NGINX,
Redis, Dropbox, Stripe and Apple). Modify the comma-separated list in
`wrangler.toml` to customize the sources that Tavily will search. Queries are
expanded with intent keywords ("deep dive", "case study", "architecture",
"postmortem", "lessons learned", "guide", "explanation", "best practices") and
exclude release-style terms. Results are scored by URL path, language and
domain. Candidate pages are fetched and discarded unless they contain 1,000–4,000
words, several section headings, code snippets and at least one of the intent
keywords. If no suitable article is found, the worker retries with advanced
search depth and finally with a small set of fallback sources.

## Deployment

Apply `schema.sql` to the D1 database and deploy with Wrangler:

```bash
wrangler d1 execute <DB_NAME> --file=schema.sql
wrangler deploy
```
