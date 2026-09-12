# DEV.md — Developer Guide

Practical guide for a human developer working on this repo day-to-day. For the "why" behind decisions, see [CLAUDE.md](./CLAUDE.md). For what to build next and in what order, see [FEATURES.md](./FEATURES.md).

## 1. Prerequisites

- Node.js 22+ and npm 10+
- PostgreSQL (or use Docker — see §6)
- Git

## 2. Repository layout

```
new strike/
├── apps/
│   ├── server/     AdonisJS 6 API (TypeScript, ESM)
│   └── client/     React 19 + Vite + TypeScript
├── packages/
│   └── shared/     Shared types/DTOs used by both apps
├── docker/          Dockerfiles + compose (added with item #2)
├── docs/            Longer-form notes that don't belong in the root .md files
├── CLAUDE.md        AI/project context
├── DEV.md           This file
├── FEATURES.md      Feature backlog + required build process
└── README.md        Project overview
```

### `apps/server` (AdonisJS)

Standard AdonisJS structure:
- `app/controllers` — HTTP request handlers, one file per resource
- `app/models` — Lucid models
- `app/validators` — Vine validators for request input
- `app/services` — business logic that doesn't belong in a controller or model
- `database/migrations` — schema changes, one migration per change, never edit a migration that's already been run in a shared environment
- `start/routes.ts` — route definitions
- `tests/` — Japa test suites (see §5)

Import paths use AdonisJS's subpath imports (`#controllers/*`, `#models/*`, etc. — defined in `apps/server/package.json`'s `imports` field), not relative `../../..` paths.

### `apps/client` (React)

- `src/components/ui/` — the shadcn-style component primitives (Button, Card, Input, Label, …). These are **owned code**, not a black-box dependency — edit them directly when the design system needs to change, but changes here affect every feature, so they should be deliberate.
- `src/features/<name>/` — one folder per feature (e.g. `src/features/auth`, `src/features/quotes`), containing that feature's pages, components, hooks, and API calls. Don't reach into another feature's internals — share through `packages/shared` types or `src/lib`.
- `src/lib/` — cross-cutting utilities (e.g. `cn()` class-merging helper, the API client).
- Path alias: `@/*` maps to `src/*` (configured in `tsconfig.app.json` and `vite.config.ts`).

### `packages/shared`

Plain TypeScript, compiled with `tsc` to `dist/`. Both apps import from `@pricingframe/shared`. Run `npm run build` (or `--watch`/`dev`) here after changing a type so consumers pick it up. If you add a new domain concept, define its shared shape here and its meaning in CLAUDE.md's glossary.

## 3. Getting started

```bash
npm install                # installs all workspaces from the repo root
npm run dev                # (once Turborepo pipeline exists) runs server + client together
```

Until the Turborepo root scripts exist (see FEATURES.md item #1), run each app individually:

```bash
cd apps/server && npm run dev     # http://localhost:3333
cd apps/client && npm run dev     # http://localhost:5173 (proxies /api to :3333)
```

Copy `apps/server/.env.example` to `apps/server/.env` and fill in real values (database credentials, `APP_KEY`, etc.) before running the server.

## 4. The build process for every feature (read FEATURES.md first)

Short version — full detail is in FEATURES.md:

0. State the plan for the step (what's being built, what will be tested) before writing code.
1. Backend (migration → model → validator → controller → route) for the feature.
2. Backend tests for every endpoint added. Run `npm run test` in `apps/server` — must pass.
3. Frontend for the feature, wired to the real API (no mock data left in place).
4. A test plan for the frontend flow, executed and passing.
5. A plain-language summary of what was built and how it works — enough to fully understand the change, not just "tests passed."
6. The developer tests the change personally and confirms it. Automated tests passing is not, by itself, a reason to commit.
7. `git commit` for the completed feature, referencing the FEATURES.md item — only after that personal confirmation.

Do not start step 3 before step 2 is green. Do not commit before step 6. Do not start the next feature before step 7.

## 5. Testing

- Backend: [Japa](https://japa.dev/) (`@japa/runner`), already configured by the AdonisJS starter kit. Run with `cd apps/server && npm run test`. Put HTTP-level tests under `tests/functional/`, unit tests under `tests/unit/`.
- Frontend: a test plan for now is a short, explicit written checklist (steps to perform + expected result) executed manually and recorded in the PR/commit description; introduce an automated frontend test runner (e.g. Vitest + Testing Library) once there's enough UI complexity to justify it — track that decision as its own FEATURES.md item when it comes up, don't add it silently.

## 6. Docker

The whole stack (Postgres, the AdonisJS server, the React client) runs with one command:

```bash
cp .env.example .env    # once — sets Postgres creds + APP_KEY for docker-compose
docker compose up --build
```

- Client: http://localhost:5173 (nginx, proxies `/api/*` to the server)
- Server: http://localhost:3333
- Postgres: localhost:5432

Migrations run automatically every time the server container starts (see `docker/server.Dockerfile`'s `CMD`) — you don't need to run them by hand. `docker compose down` stops everything; add `-v` to also drop the Postgres data volume.

This is separate from your local (non-Docker) `apps/server/.env` — that file is for running the server directly with `npm run dev` against whatever Postgres you have locally. The root `.env` (from `.env.example`) is only read by `docker-compose.yml`.

## 7. Postman collection

A ready-to-import Postman collection lives in `postman/`:

- `PriceFRAME.postman_collection.json` — the requests, organized by feature (currently just `Auth`: Register, Login, Me, Logout).
- `PriceFRAME.postman_environment.json` — a `base_url` (`http://localhost:3333`) and a `token` variable.

**To use it:** in Postman, File → Import both files, then select the "PriceFRAME - Local" environment from the environment dropdown (top right) before sending requests. Register and Login have a test script that automatically saves the returned token into the `token` environment variable, so Me and Logout (which send `Authorization: Bearer {{token}}`) work immediately afterward with no manual copying.

Point `base_url` at whichever server you're running against (local `npm run dev`, or the Docker stack — both listen on :3333 by default). As new features add endpoints, add them to this collection in their own folder (e.g. a future "Quotes" folder), following the same pattern: use `{{base_url}}`, and add test scripts for anything a later request depends on (like a saved token or an ID).

To verify the whole collection still works from the command line (useful before a demo, or in CI later), run it headlessly with [Newman](https://www.npmjs.com/package/newman):

```bash
npx newman run postman/PriceFRAME.postman_collection.json -e postman/PriceFRAME.postman_environment.json
```

## 8. Git workflow

- Commit only complete, tested features (see §4). No partial/broken commits on `main`.
- **Keep commits minimal and scoped to one related change.** One commit = one feature/fix/chore, not a grab-bag of unrelated edits. Don't bundle "add auth" with an unrelated formatting pass or a different feature's docs update.
- **Commit messages are short — a single summary line**, Conventional-Commits style (`feat(auth): add login/register endpoints`, `fix(quotes): correct margin rounding`, `chore: monorepo setup`). Avoid long multi-paragraph commit bodies; if a change genuinely needs more explanation, put it in the PR description, not the commit message.
- No AI co-author trailers or similar attribution lines in commit messages for this repo.
- Reference the FEATURES.md item number in the commit or PR description when relevant.
- Update FEATURES.md's status column (`☐` → `▶` → `✔`) as part of the same commit as the work it describes.

## 9. Verifying the monorepo setup (item #1) locally

There's no product feature to click through yet — this stage just proves the scaffold works. To check it yourself:

```bash
npm install                 # from the repo root, once
npx turbo run build         # builds server + client + shared — all 3 must succeed
npx turbo run typecheck     # typechecks all 3 — must report no errors
```

Then run the apps and look at them directly:

```bash
cd apps/server && npm run dev   # starts on http://localhost:3333
# in another terminal:
curl http://localhost:3333      # should return {"hello":"world"}
```

```bash
cd apps/client && npm run dev   # starts on http://localhost:5173
# open http://localhost:5173 in a browser — you should see a shadcn-styled
# "PriceFRAME" card with a working button (confirms Tailwind + shadcn wiring)
```

Postgres isn't required to verify this stage — the server boots and serves HTTP without a live database connection. It is required from here on (item #3 onward); either run the Docker stack (§6) or point `apps/server/.env` at a local Postgres instance.

## 10. Known tooling quirks (read before you hit these yourself)

- **Working directory has a space in it** (`D:\buy-frame\new strike`). The `shadcn` CLI (`npx shadcn@latest add ...`) has a bug where it sometimes writes generated files to a literal `./@/...` folder instead of resolving the `@/*` alias to `src/`, specifically in paths containing a space. If you see a stray `@/` directory appear after running `shadcn add`, move its contents into the matching `src/` subfolder and delete the `@/` directory — don't assume the files aren't needed.
- `create-adonisjs@latest` requires Node 24+; this project scaffolded the server with `create-adonisjs@2.4.1`, which supports the `--kit=api --db=postgres --auth-guard=access_tokens` flags on Node 22. If re-scaffolding anything, check the installed Node version first.
- TypeScript 6's `tsconfig` no longer wants `baseUrl` alongside `paths` (it's deprecated) — path aliases should be declared as just `"paths": { "@/*": ["./src/*"] }` without `baseUrl`.
- **Docker images must not `npm ci` from the committed lockfile.** `package-lock.json` is generated on Windows, and several deps (`@swc/core`, `rolldown`, etc.) ship platform-specific native binaries as optional dependencies. `npm ci` trusts the lockfile literally and won't fetch the Linux binary inside the container, so both Dockerfiles intentionally only copy `package.json` files (not the lockfile) and run `npm install`, letting npm re-resolve the right binaries for Linux. See the comments in `docker/server.Dockerfile`.
- **nginx's automatic `proxy_pass` prefix-stripping is unreliable — use an explicit `rewrite`.** `docker/nginx.conf`'s `/api/` location uses `rewrite ^/api/(.*)$ /$1 break;` before `proxy_pass http://server:3333;` rather than relying on `proxy_pass http://server:3333/;` to strip the `/api/` prefix automatically — the latter did not strip it in testing.
- **On Windows, `localhost` can resolve to `::1` (IPv6) and hit the wrong process** if something else is also bound to the same port on IPv6 only (e.g. a leftover `vite dev` process). If a port seems to be serving stale content, check `netstat -ano | grep <port>` for more than one listener and test with `127.0.0.1` explicitly to bypass the ambiguity.
