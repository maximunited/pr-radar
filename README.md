# PR Radar

Open PR dashboard for medik8s and OpenShift teams. One table with CI status, bot reviews, peer comments, and author filters.

**Live:** https://pr-radar-kohl.vercel.app

## What it shows

| Column | Description |
|--------|-------------|
| Author | PR author (GitHub handle) |
| Repo | Shortened org/repo with full name on hover |
| PR | Number linking to GitHub |
| Title | PR title |
| CI | Default CI checks as colored dots (green/red/yellow) |
| E2E | Periodic `pj-rehearse` job status |
| Qodo | Qodo AI review: clean, open items, thinking, or rate-limited |
| CR | CodeRabbit review: same states |
| Comments | Human review threads: unresolved / total |
| Reviews | Approvals (✓) and changes-requested (✗) |
| Commits | Commit count |
| Labels | GitHub labels |

## Filters

- **Smart filters:** "Needs attention" (failing CI / open bot items / unresolved comments) and "Ready to merge"
- **State:** open / draft / closed
- **Repo:** per-repository
- **Authors:** multi-select with defaults; type any GitHub username to load their PRs on demand

## Default repos and authors

Configured in `packages/core/src/config/default.ts`:

```
Repos:    medik8s/system-tests, openshift/release
Authors:  maximunited, ugreener, gamado
```

Only the default authors' PRs are fetched on load. Adding a new author via the filter fetches and caches their PRs on demand.

## Stack

```
packages/
  core/   — GitHub GraphQL API, Upstash Redis cache, config, types
  web/    — Next.js 15, TanStack Table, Clerk auth, Tailwind
  cli/    — Terminal table output (tsx packages/cli/src/index.ts)
```

- **Auth:** Clerk (GitHub OAuth fallback for token)
- **Cache:** Upstash Redis, keyed per (repo, author), 5-min TTL
- **Hosting:** Vercel (auto-deploy from `main`)

## Local dev

```bash
pnpm install

# Copy env template and fill in values
cp .env.example packages/web/.env.local

# Or pull from Clerk directly (after clerk auth login)
clerk env pull --file packages/web/.env.local

pnpm dev   # → http://localhost:3000
```

Required env vars (see `.env.example`):

| Variable | Source |
|----------|--------|
| `GITHUB_TOKEN` | GitHub PAT or `gh auth token` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard / Vercel integration |
| `CLERK_SECRET_KEY` | Clerk dashboard / Vercel integration |
| `KV_REST_API_URL` | Upstash / Vercel integration |
| `KV_REST_API_TOKEN` | Upstash / Vercel integration |

## CLI

```bash
# Uses GITHUB_TOKEN or gh auth token
pnpm --filter cli dev

# Add extra repos at runtime
pnpm --filter cli dev -- org/repo
```

## Adding a new default repo

Edit `packages/core/src/config/default.ts`:

```ts
{
  repo: "your-org/your-repo",
  ciPatterns: {
    e2e: ["pj-rehearse*"],
    ignore: [],
  },
}
```

CI job names matching `e2e` patterns go in the E2E column; everything else goes in the CI column.
