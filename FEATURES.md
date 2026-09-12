# Features

This file is the single source of truth for **what exists, what's in progress, and what's next**. Every piece of work — infrastructure or product feature — must have an entry here before it's started, and its status must be kept current.

Read this file together with [CLAUDE.md](./CLAUDE.md) (project context) and [DEV.md](./DEV.md) (how to work day-to-day).

## The rule: one step at a time

We do not build several things in parallel or in one long unattended stretch. For every feature in the backlog below, work happens in this exact order, and each stage gate must pass before the next one starts:

0. **Plan first.** Before writing any code for the step, state the approach (what will be built, which files/endpoints, what will be tested) and get a go-ahead. Don't skip straight to implementation just because the next item is obvious from the backlog.
1. **Backend first.** Build the API for the feature (migrations, models, controllers/services, routes, validation).
2. **Backend tests.** Write test cases for every endpoint the feature adds (happy path + key failure paths). Run them. They must pass.
3. **Frontend.** Only after step 2 is green, build the UI for the feature against the real API.
4. **Test plan.** Write a short manual (or automated, where practical) test plan for the frontend flow, execute it, and confirm it passes.
5. **Explain it.** After finishing a step (or a meaningful chunk of one), give a complete, plain-language summary of what was actually built and how it works — enough for a non-implementer to fully understand what changed, not just "tests passed."
6. **The user tests it personally.** Automated tests passing is necessary but not sufficient. Wait for the user to try it themselves and confirm it's good.
7. **Commit.** Only once backend + tests + frontend + test plan all pass **and the user has personally confirmed it works**, create a git commit for that feature. **Do not start the next feature before this commit exists.**

If a stage fails, fix it and re-run that stage's tests — don't skip ahead.

## Status legend

- `☐` Not started
- `▶` In progress
- `✔` Done (backend tested, frontend tested, committed)

## Backlog

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 0 | Project docs (CLAUDE.md, DEV.md, FEATURES.md, README.md) | ✔ | Committed alongside item #1. |
| 1 | Monorepo setup (npm workspaces + Turborepo, `apps/server` AdonisJS, `apps/client` React/Vite, `packages/shared`, Tailwind v4 + shadcn/ui in client) | ✔ | Root `package.json`/`turbo.json` added; `turbo run build` and `turbo run typecheck` pass across all 3 workspaces; server boots and responds on :3333; client builds. Committed as `chore: monorepo setup`. |
| 2 | Docker setup (Postgres + server + client, `docker-compose.yml`, Dockerfiles) | ✔ | `docker compose up` builds and runs all 3 services; verified: Postgres healthy, server auto-runs migrations and responds on :3333, client (nginx) serves the app and proxies `/api/*` to the server on :5173. Committed as `chore: add Docker setup`. |
| 3 | Authentication (register, login, logout, session/token refresh, "who am I") | ☐ | Priority feature — needed for the Monday client demo. |
| 4 | Quoting — MVP (create a quote, add corridors, compute pricing, list/view quotes) | ☐ | Priority feature — needed for the Monday client demo. Scope to be narrowed further when we start it; see "Quoting MVP scope" below. |
| 5 | Roles & permissions (admin / sales / viewer) | ☐ | Deferred until after the demo unless the client asks for it. |
| 6 | Corridor catalog & tiered/volume pricing | ☐ | Deferred — old project's "quote_aggregates" / "tiered fields" concepts, redesigned cleanly (see CLAUDE.md domain glossary for the naming fix). |

### Definition of done, per feature (checklist to paste into a PR/commit description)

- [ ] Migrations written and run cleanly on a fresh database
- [ ] Models/relationships implemented
- [ ] Endpoints implemented with input validation
- [ ] Backend tests written for each endpoint (success + at least one failure case) and passing
- [ ] New endpoints added to the Postman collection (`postman/PriceFRAME.postman_collection.json`), with a test script for anything a later request depends on (e.g. a saved token or ID)
- [ ] Frontend UI implemented against the real API (no mocked data left behind)
- [ ] Frontend test plan written, executed, and passing
- [ ] FEATURES.md status updated to `✔`
- [ ] Committed to git with a message describing the feature

## Stage-1 gate for "Monorepo setup" (item #1)

Before this item can be marked `✔`, the following must all be true and verified:

- [x] Root `package.json` defines npm workspaces (`apps/*`, `packages/*`) and a `turbo.json` pipeline for `dev`/`build`/`lint`/`typecheck`/`test`
- [x] `apps/server` runs (`npm run dev`) and responds on its port (verified: `GET /` → `{"hello":"world"}` on :3333)
- [x] `apps/client` runs (`npm run dev`), builds (`npm run build`), and renders the shadcn-based placeholder page
- [x] `packages/shared` builds and typechecks cleanly, and is linked as a workspace dependency so both apps *can* import `@pricingframe/shared` — it isn't imported by real app code yet since no feature needs it until authentication starts
- [x] Root `.gitignore`, `.editorconfig`, and shared lint/format config exist
- [x] Everything above is committed in one commit: `chore: monorepo setup` (`047e369`)

## Quoting MVP scope (for when item #4 starts)

Kept intentionally small so it's demoable Monday without dragging in the full old feature set:

- A quote has a name, an owner, a status, and one or more corridors.
- A corridor has: origin country, destination country, payout currency, fixed fee, variable fee %, FX spread %, average transaction value, yearly volume.
- The API computes and returns, per corridor and per quote: yearly revenue, yearly margin, take rate %.
- Flat pricing only for the demo. Volume-tiered pricing (item #6) is a deliberate follow-up, not part of the MVP.

## Template: adding a new feature

Copy this block into the Backlog table (as a new row) and, if it's non-trivial, expand it into its own subsection below the table like "Quoting MVP scope" above.

```
| # | <Feature name> | ☐ | <one-line description of scope and why it's needed> |
```

Subsection template for a non-trivial feature:

```markdown
## <Feature name> scope

- What it does, in plain language.
- What's explicitly OUT of scope for the first pass.
- Any domain terms that need defining (add them to CLAUDE.md's glossary too).

### Backend
- [ ] Migration(s):
- [ ] Model(s):
- [ ] Endpoint(s): `METHOD /path` — purpose
- [ ] Tests:

### Frontend
- [ ] Page(s)/component(s):
- [ ] API integration:
- [ ] Test plan:
```
