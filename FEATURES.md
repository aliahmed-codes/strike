# Features

This file is the single source of truth for **what exists, what's in progress, and what's next**. Every piece of work — infrastructure or product feature — must have an entry here before it's started, and its status must be kept current.

Read this file together with [CLAUDE.md](./CLAUDE.md) (project context) and [DEV.md](./DEV.md) (how to work day-to-day).

## The rule: one step at a time

We do not build several things in parallel or in one long unattended stretch. For every feature in the backlog below, work happens in this exact order, and each stage gate must pass before the next one starts:

0. **Plan first.** Before writing any code for the step, state the approach (what will be built, which files/endpoints, what will be tested) and get a go-ahead. Don't skip straight to implementation just because the next item is obvious from the backlog. If there's more than one reasonable way to build a piece of it, ask which one instead of picking silently.
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
| 3 | Authentication (login, logout, "who am I") | ✔ | Priority feature — needed for the Monday client demo. There is **no public self-registration** — see item #7. Backend: login/logout/me endpoints + `create:user` ace command, 11 passing Japa tests (includes a deactivated-account check). Frontend: login page (Thunes branding, navy theme), session persistence, protected home route. `users` table aligned with the old schema's cheap/low-risk fields (see "Users table: schema alignment" below). Postman collection updated. Manually tested and confirmed by the user. |
| 7 | Admin: create & manage users (replaces the interim `create:user` command) | ☐ | High priority — start this before/alongside Quoting. There is no self-service registration in this product (confirmed against the old app): an admin creates every account. In the old app: admin picks email/full name/role/profile, **sets the initial password directly**, the system emails the new user a welcome message with the login URL and that temporary password, and the user changes it later via the normal forgot-password flow (a separate, already-scoped-out feature). Needs: a `user.create`-style permission check (ties into item #5), an admin-only `POST /users`-style endpoint, and an admin UI (a simple table + "Add user" form is enough for v1 — no need to replicate the old app's full profile/manager fields yet). Until this ships, `node ace create:user` (see DEV.md) is the only way to create an account. |
| 4 | Quoting / "New Pricing Request" — the main client-facing feature. Real data, not mock. 7 tabs: Summary, Setup Fee, Pricing, P&L, Quoting Summary, Legal, Approvals. Built in phases — see "Quoting: full scope and phases" below. | ▶ | **Phase 1 done and committed, both backend and frontend**, manually tested and confirmed by the user: reference/corridor data verified row-for-row against the old app, Quote/QuoteCorridor CRUD + backend pricing service, dynamic closable-tab workspace, Summary tab (collapsible sections) and Pricing tab UI, corridor picker matching the old app's exact filtering/UX. **Phase 1b (Pricing tab parity closure) in progress** — real FX Margin/Margin Fee/Gross Margin %/financial-vs-network approval done, tested, and committed (backend + frontend); tiered/volume pricing and the frontend-only table UX (summary rollups, filters/sort, bulk edit/restore, Excel export) still to come. **Phase 2 (Setup Fee) done and committed**, both backend and frontend. Phases 3-5 (P&L endpoint, Approvals, Legal doc generation) not started. |
| 5 | Roles & permissions (admin / sales / viewer) | ☐ | Deferred until after the demo unless the client asks for it. |
| 6 | Corridor catalog & tiered/volume pricing | ☐ | Deferred — old project's "quote_aggregates" / "tiered fields" concepts, redesigned cleanly (see CLAUDE.md domain glossary for the naming fix). |
| 8 | Dashboard shell UI (mock data) | ✔ | Manually tested and confirmed by the user (`docs/test-plans/dashboard-shell.md`). UI-only pass, deliberately ahead of Quoting's backend — visual layout + polish for the Monday demo. Full authenticated app shell (header with logos/notifications/user menu, nav tabs) + a Dashboard page (Payment Metrics + Corridor Status panels), matching the old app's layout but rebuilt clean (the old version had 100% hardcoded data, dead duplicate components, and an unused `framer-motion` dependency — see below). All dashboard numbers/tables here are **mock data**, explicitly flagged as such in code, served through hooks shaped like the real ones will be (so swapping in real data from item #4/#6 later is a hook-body change, not a rewrite). Framer Motion is actually used this time: card entrance/hover animations, animated stat count-ups, animated nav-tab underline. "Pricing Requests" and "Approvals" nav tabs exist visually but route to a placeholder page — no backend for either exists yet. Notification bell is static (a badge, no real unread-count backend). |

### Definition of done, per feature (checklist to paste into a PR/commit description)

- [ ] Migrations written and run cleanly on a fresh database
- [ ] Models/relationships implemented
- [ ] Endpoints implemented with input validation
- [ ] Backend tests written for each endpoint (success + at least one failure case) and passing
- [ ] New endpoints added to the Postman collection (`postman/STRIKE.postman_collection.json`), with a test script for anything a later request depends on (e.g. a saved token or ID)
- [ ] Frontend UI implemented against the real API (no mocked data left behind)
- [ ] Frontend test plan written, executed, and passing
- [ ] FEATURES.md status updated to `✔`
- [ ] Committed to git with a message describing the feature

## Stage-1 gate for "Monorepo setup" (item #1)

Before this item can be marked `✔`, the following must all be true and verified:

- [x] Root `package.json` defines npm workspaces (`apps/*`, `packages/*`) and a `turbo.json` pipeline for `dev`/`build`/`lint`/`typecheck`/`test`
- [x] `apps/server` runs (`npm run dev`) and responds on its port (verified: `GET /` → `{"hello":"world"}` on :3333)
- [x] `apps/client` runs (`npm run dev`), builds (`npm run build`), and renders the shadcn-based placeholder page
- [x] `packages/shared` builds and typechecks cleanly, and is linked as a workspace dependency so both apps can import `@strike/shared` — now actually used by the client's auth hooks (`AuthUser`, `AuthSession`, `LoginPayload`, `RegisterPayload`)
- [x] Root `.gitignore`, `.editorconfig`, and shared lint/format config exist
- [x] Everything above is committed in one commit: `chore: monorepo setup` (`047e369`)

## Users table: schema alignment with the old system

To avoid a painful data migration later, the `users` table was checked column-by-column against the old app's actual schema (`priceframe_schema.sql` / `1746000000001_create_identity_system.ts`) and deliberately adopted the fields that are cheap now and costly to add later:

**Adopted now:**
- `first_name` + `last_name` (split, matching the old schema) instead of a single `full_name` — splitting a name after the fact is lossy; done via a proper migration with a backfill, not a data-dropping rewrite.
- `is_active` (boolean, default true) — and it's actually **enforced**: login rejects a deactivated account with 403. A schema column with no behavior behind it isn't worth adding.
- `phone` (nullable) and `timezone` (default `UTC`) — harmless, commonly needed regardless of the old system.

**Deliberately NOT adopted** (would reintroduce complexity CLAUDE.md already says to defer until there's a real need):
- Normalized `roles` and `profiles` **tables** with hierarchy (`parent_role_id`) — we use a simple `role` enum instead (see CLAUDE.md's auth model). If/when item #5 (roles & permissions) needs more than 3 fixed roles, revisit this as its own decision.
- `manager_id`, `created_by`/`modified_by` audit columns, `deleted_at` soft-delete — no feature needs these yet.
- Account lockout fields (`failed_attempts`, `is_locked`, `locked_at`) and MFA fields (`mfa_enabled`, `mfa_secret`, etc.) — real security features, but nothing has asked for them yet; add the columns *when* that feature is actually built, not speculatively.
- Firebase/SSO fields (`firebase_uid`, `auth_provider`, `firebase_email`) — no SSO requirement exists for this rebuild.

If a future data-import task needs any of the "not adopted" fields, that's the point to add them — as their own scoped feature with its own migration, not retrofitted quietly.

## Quoting: full scope and phases (item #4)

This is the main feature the client sees — a "New Pricing Request" with 7 tabs: **Summary, Setup Fee, Pricing, P&L, Quoting Summary, Legal, Approvals**. Investigated the old app's real implementation of all 7 tabs before designing this (see git history for the research); the old system had real weaknesses we're deliberately not repeating:

- **All P&L/revenue/margin numbers were computed in the browser** and stored as an opaque JSON blob — no backend source of truth. **We do it properly: the backend computes and owns every number** (`app/services/quote_pricing_service.ts`); the frontend only displays them.
- **Setup Fee and P&L had no real database tables** — JSON blobs on the quote. We use real, normalized columns/tables instead.
- Duplicate near-identical columns (`standard_fixed_fee_usd` vs `std_fixed_fee_usd`, parallel `_precise` copies of every numeric field) — not repeated here; one canonical numeric column per value.

**Database note:** reference/corridor data is real, not invented. Regions, countries (207, incl. Syria which the old app's own catalog mistags as region "Africa" — kept for exact parity), currencies (97, covering every currency the real corridor catalog uses), use cases, integration types, ICP hierarchy, and pegged rates come from the old app's live database and its hardcoded UI option lists — exported as JSON under `database/data/real_*.json` so seeding doesn't depend on a live connection to that database. The corridor catalog (1,271 rows) is the old app's actual active production corridor version, deduped on the exact same key the old app's own picker uses (verified row-for-row: total count, region counts, and service counts all match the old app exactly).

### Phase 1 — Quote + Corridors + Pricing core — ✔ backend done, tested, committed

- Reference/lookup tables: `regions`, `countries`, `currencies`, `use_cases`, `integration_types`, `icp_nodes`, `pegged_rates` — seeded from real old-project data.
- `corridors` — the catalog a user picks from when adding a corridor to a quote.
- `quotes` — header: name, status (draft/submitted/approved/rejected/closed), owner, opportunity type, partner country, use case(s), integration type, 3 independent ICP levels, contract length, currencies, plus (added once real Summary-tab screenshots arrived) `show_fx_source_in_contract`/`show_fx_spread_in_contract`, `fx_model`, `selected_pricing_strategy`, `selected_fx_pricing`, `default_fee_currency_id`.
- **Multi-value fields, matching the old app exactly** (confirmed required, not simplified): a quote can have several funding currencies and several source currencies (`quote_funding_currencies`/`quote_source_currencies` join tables) and several use cases (`quote_use_cases`) — `funding_currency_id`/`source_currency_id` on the quote itself remain the "default" one shown first.
- `quote_corridors` — one row per corridor on a quote: inputs (volume, transactions, fixed fee, variable fee %, FX spread, discount %) and backend-computed outputs (revenue, FX margin, total revenue/margin, take rate, `needs_approval` + reasons).
- `app/services/quote_pricing_service.ts` — the single source of truth for all pricing math. **Formulas are a documented first pass** (see comments in that file), not yet confirmed against real finance/business rules — centralized in one file specifically so they're easy to audit/adjust without touching controllers, models, or the frontend.
- `app/services/corridor_facet_service.ts` + `GET /reference/corridors/facets` — per-dimension corridor counts (region/country/service/transaction-type/payout-currency/payer) given any combination of active filters, powering the "Corridors to Offer" picker. Matches the old app's exact (verified against its real code) narrowing rule: Region is a one-way top-level filter — it narrows every other panel but is never itself narrowed by anything; the other five panels form a fully mutual facet (each narrowed by every other active filter, never by its own). Every panel always lists every value that exists in the catalog — a 0-count value stays listed (for the UI to disable, not remove) rather than disappearing. Supports "Hide USD SWIFT" and a `restrictToUseCaseAllowedCountries` flag (the old app's compliance rule restricting the picker to a fixed country allow-list when the quote's use cases include "Last Mile Payout" or "Account Top-Up").
- Endpoints: `GET/POST /reference/*` (lookups + catalog + facets), `GET/POST/PATCH/DELETE /quotes`, `POST/PATCH/DELETE /quotes/:id/corridors/:id`. A quote is only editable (header or corridors) while `status = 'draft'`; an owner sees only their own quotes, an admin sees all.
- 45 passing tests, Postman collection updated with Reference Data + Quotes folders including the facets endpoint.
- **Frontend: done, tested, committed.** A dynamic, closable tab workspace (`useQuoteWorkspaceStore.ts`, Zustand + `persist`) — "New Pricing Request" opens a client-only draft tab (no backend row until first Save, confirmed matching the old app's real behavior), reused if an empty one is already open, restored across refresh, and prompts with a styled confirm dialog before discarding unsaved changes on close. Summary tab built as collapsible sections (Quoting Details, Technical Pricing Details, Static Rates, Corridors to Offer, Financial Summary) using a shared `useQuoteFormField` layering hook (pending edits buffered locally until Save). Pricing tab: corridor picker + live computed revenue/margin/take-rate per added corridor. Real "Pricing Requests" list page. Enum option lists (FX Model, Pricing Strategy, FX Pricing, Opportunity Type) and the 16 Use Cases match the old app's real values exactly, not invented ones. Setup Fee tab shows a placeholder until its backend exists (Phase 2).

### Phase 1b — Pricing tab parity closure — ▶ in progress

While building Phase 2 we re-compared the shipped Pricing tab against the old app's real one (a general-purpose agent read both in full) and found Phase 1's Pricing tab, while functionally correct for what it covers, is missing real business logic the old app has — not just styling. Reopening this rather than folding it into a later phase, since it's the same feature. Scope, in build order:

1. **Missing computed columns per corridor**: FX Margin, FX Margin %, Margin Fee, Gross Margin % — old app computes and displays these; new app currently only shows Revenue, Margin, Take Rate. Backend: extend `quote_pricing_service.ts` + add columns to `quote_corridors`.
2. **Approval-type distinction** — old app's `checkCorridorApproval` separates *financial* approval from *network* approval, each with its own trigger conditions and instruction text; new app only shows one generic "Needs Approval" flag with no distinction or guidance.
3. **Tiered/volume-based pricing** — this is backlog item #6 ("Corridor catalog & tiered/volume pricing"), previously deferred on purpose, now being pulled into this closure pass at the user's request for full parity. Old app's `computeTieredPricing` assigns a corridor's volume to a pricing band and applies that band's rate — needs its own investigation of the exact band structure before schema/logic is written (biggest, riskiest piece of this phase, built last).
4. **Frontend-only, no new tables**: a Summary rollups panel (Total Corridors/Volume/Transactions/Revenue/Average Take Rate) above the corridors table; column filters (region, country, service, currency, approval status, negative-margin flags) and sorting; a "Download Corridors" Excel export (client-side, mirrors the old app's approach of exporting the currently-displayed table — no backend involved).
5. **Bulk edit / bulk delete / restore-deleted** — bulk edit/delete can reuse the existing per-corridor endpoints called in a loop; "restore deleted" needs corridors to be soft-deleted (`deleted_at` column) instead of hard-deleted as today, so a restore survives a page refresh (a deliberate improvement over the old app, which only kept deleted-corridor state in memory).

Order: (1) and (2) first — small, and they change real numbers users see today. Then (3) as its own backend-then-frontend pass, investigated thoroughly first. Then (4) and (5) together as a frontend-focused pass.

**(1) and (2) — done, tested, and committed (backend + frontend).** A general-purpose research agent extracted the old app's exact, active formulas from its real code (`client/src/features/quotes/lib/pricing-calculations.ts` / `PricingTab.tsx` — its "server" does essentially none of this math; everything lived in the browser as JS floats). Key finding while implementing: the real formulas need per-corridor master data (FX Source, Treasury FX Cost, cost basis, and the Need Approval/Internal/Central Bank compliance flags) that Phase 1's original corridor export never captured — only routing/identity fields. Re-exported this data from the old app's live database (`corridors_list.corridor_details`, its currently-active catalog version) as `database/data/real_corridor_pricing_data.json` and wired it into `reference_data_seeder.ts` so it backfills automatically on every seed — 1,263 of our 1,271 corridors matched (8 don't exist in the old app's *current* active version due to catalog drift since Phase 1's original export; left null, never guessed).

`app/services/quote_pricing_service.ts` now computes:
- **FX Margin** using the corridor's real FX Source: `yearlyVolume × spread` for Cost-Plus corridors, `0` when funding currency equals payout currency (non-Cost-Plus), otherwise `yearlyVolume × (spread − treasuryFxCost)`.
- **Margin Fee** as `revenueFee − (corridor's real fixed + variable cost basis)` — previously this was a placeholder equal to revenue because no cost data existed at all.
- **Gross Margin %**, **FX Margin %**, **Take Rate** from the above, matching the old app's real definitions.
- **Financial approval** (`needs_financial_approval`/`financial_approval_reasons`): gross-margin floor by opportunity type (New Partner 60%, Upsell 45%, otherwise only flags on a *negative* margin — the old app's real `GM_THRESHOLDS`), fee discount over 35%, B2B transaction type (always flagged, matching the old app's real rule), Like-for-Like B2B variable fee floor, and a margin-percent-of-volume floor (0.25% B2B / 0.35% non-B2B).
- **Network approval** (`needs_network_approval`/`network_approval_reasons`): a pure lookup on the corridor's own Need Approval/Internal/Central Bank catalog fields (not a calculation) — clear only if all three are clean; a corridor with no catalog data at all is flagged for manual verification rather than silently assumed safe.

`needs_approval`/`approval_reasons` stay as the OR/concatenation of both, so nothing that already reads them breaks.

**Deliberately not replicated** (documented in the service file, not guessed at): the old app's Cost-Plus-with-partner-revenue-share FX branch (needs a Market-Based-Pricing "partner share" input we don't have), a EUR→XAF/XOF zero-spread special case (undocumented currency-pair quirk), and an "FX spread below minimum spread" approval check (the old app's own code never actually populates that minimum from real data either — a dead path in the source).

16 new/updated unit tests + all 65 backend tests passing. Postman collection updated.

**Frontend: done, tested, committed.** `computeCorridorPricing` moved into `packages/shared/src/lib/corridor_pricing_math.ts` (same pattern as Setup Fee's shared math module) so the Pricing tab can show a genuinely live preview using the exact function the backend uses to validate on save. Pricing tab now shows FX Margin %, Margin Fee, and Gross Margin % columns, and splits the old single "Needs Approval" flag into two independently-clickable badges (Financial / Network), each opening a popover with its own specific reasons. Real-time preview matches the old app's live behavior in two places: the "Add a Corridor" form shows a live-computed preview panel before you click Add, and each existing corridor row recomputes its own preview live as you type in its inline-edit fields, saving for real only on blur. Test plan: `docs/test-plans/pricing-tab-phase1b.md`.

### Phase 2 — Setup Fee — ✔ backend and frontend done, tested, committed

Investigated the old app's real implementation before building (it stored this entire tab as one unvalidated JSON blob — `pricing_tool_snapshot` on `quotes` — with zero server-side validation; every business rule lived only in React state). Rebuilt as 5 real normalized tables: `quote_setup_fees` (fee type, quoted price, payment schedule, MCF type/billing, waived months, rebate incentive, backend-computed `needs_approval`/`approval_reasons`), `quote_payment_milestones`, `quote_mcf_principal_slots`, `quote_mcf_block_fees` (Year-1 H1/H2 then per-year — the old app's true per-month grid was mostly vestigial in practice), and `quote_other_fees` (its real 12 fee-line-item concepts, not an unbounded blob array).

Deliberately fixes several real gaps found in the old app rather than copying them: full server-side validation (custom payment milestones must sum to exactly 100%, principal-based MCF requires the right slot count for the contract length, waived months capped at the old app's *actual* enforced max of 6 — its own input field misleadingly said 24); approval checks now cover all 12 "other fee" concepts instead of the old app's 5; one canonical revenue-threshold pair ($75k Year-1 / $150k total contract value) instead of two contradictory constants it carried. Upsell quotes bypass every setup-fee approval check, same as the old app's real (intentional) rule. `GET/PUT /quotes/:id/setup-fee`, same auth/ownership/draft-only pattern as every other quote-editing endpoint. 20-point test plan (`docs/test-plans/setup-fee-backend.md`) executed live against the running server, not just automated tests — all passing.

Also fixed while here: the backend test suite's per-test cleanup (`testUtils.db().truncate()`) started intermittently deadlocking/hanging once there were enough interlocking foreign keys — switched `tests/bootstrap.ts` to AdonisJS's transaction-rollback pattern (`withGlobalTransaction()`), which is both immune to that and ~4x faster. A global `pg` NUMERIC type-parser (`start/pg_types.ts`) fixes a real pre-existing bug found while testing this: `decimal` columns come back from a fresh Postgres SELECT as strings, not numbers — this affected the already-shipped corridors data too, not just this feature.

**Frontend**: `SetupFeeTab.tsx` — 5 sections (One-Off Fee, Monthly Commitment Fee, Other Fees, Rebate Incentive, Computed Summary), same "save the draft first" gate as the Pricing tab. The commitment-fee schedule math was pulled out into `packages/shared/src/lib/setup_fee_math.ts` so the frontend can show a genuinely **live** preview (Year 1/Total Contract Value cards that flip red/green as you type, matching the old app's real-time behavior) computed from the exact same function the backend uses to validate on save — no separate, potentially-drifting client-side copy of the formulas. Also live: Waived Months rejects/clamps anything over 6 immediately (not just on save), and the Custom payment schedule option disables itself below the $75k Quoting Price threshold and auto-reverts if the price drops below it while selected — both matching the old app's real-time behavior. Also removed a duplicate field found during this pass: `quotes.waived_months` (added during Phase 1, before Setup Fee existed) was a second, unvalidated source of truth for the same concept as `quote_setup_fees.waived_months` — dropped the column and the Summary tab's now-redundant field.

### Phase 3 — P&L endpoint (not started)

A `GET /quotes/:id/pnl`-style endpoint producing 3-year projections from the quote's corridors + setup fee, using growth-rate inputs — computed by the backend, not the client. Quoting Summary is just a read view over Phases 1-3, no new tables.

### Phase 4 — Approvals (not started)

Deliberately simple for v1: a quote has one approval record (approver, decision, comment, timestamp), no multi-step chain or auto-flagging engine yet — those depend on Roles & Permissions (item #5), which isn't built. `needs_approval`/`approval_reasons` per corridor already exist from Phase 1's pricing service.

### Phase 5 — Legal document generation (not started)

Generate a downloadable PDF/DOCX term sheet / fee annex from quote data using a template. Scoped to generation + download only — **not** the old system's in-browser collaborative document editing, comment threads, or Google Drive sync; those are separate, much larger subsystems.

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
