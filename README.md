# PriceFRAME

A cross-border payment pricing/quoting engine — build a quote, price its corridors, and see revenue/margin/take-rate instantly.

This is a from-scratch rebuild of an earlier codebase, focused on a clean architecture, a consistent design system, and a deliberate, tested build process rather than ad-hoc "vibe coded" structure.

## Stack

- **Backend:** AdonisJS 6 (TypeScript) + Lucid ORM + PostgreSQL
- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui-pattern components
- **Shared:** a `packages/shared` TypeScript package for types used by both apps
- **Monorepo:** npm workspaces + Turborepo
- **Containerization:** Docker + docker-compose (see FEATURES.md item #2 for status)

## Project docs

| File | Purpose |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | Full project context for AI assistants — architecture decisions, domain glossary, conventions, and the required working process. |
| [DEV.md](./DEV.md) | Setup guide, folder structure, and day-to-day commands for developers. |
| [FEATURES.md](./FEATURES.md) | The living feature backlog, current status of every piece of work, and the mandatory backend-tests-frontend-test-commit process for each one. |

New to the repo? Read them in that order.

## Quick start

```bash
npm install
cp apps/server/.env.example apps/server/.env   # fill in your local DB credentials
cd apps/server && npm run dev                  # http://localhost:3333
cd apps/client && npm run dev                  # http://localhost:5173
```

See [DEV.md](./DEV.md) for full setup details, testing, and Docker instructions.

## Status

Actively being rebuilt, feature by feature. Current status of every piece of work lives in [FEATURES.md](./FEATURES.md) — check there before assuming anything is finished.
