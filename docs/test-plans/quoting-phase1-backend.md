# Test Plan: Quoting Phase 1 Backend (FEATURES.md item #4, incl. Summary-tab fields)

Covers everything built so far for the "New Pricing Request" feature's backend: reference data, corridor catalog, corridor facets, and Quote/QuoteCorridor CRUD (including the multi-currency/ICP/Summary-tab fields added after the screenshots). Use Postman (import `postman/STRIKE.postman_collection.json` + environment) — request names below match the collection exactly.

## Setup

1. Make sure Postgres is reachable and migrations + seed data are current:
   ```bash
   cd apps/server
   node ace migration:run --force
   node ace db:seed
   ```
2. Start the server: `npm run dev` (http://localhost:3334)
3. In Postman, select the "STRIKE - Local" environment, then run **Auth → Login** (`qa@example.com` / `password123`, or your own account) to populate `{{token}}`.

## A. Reference data (all read-only lookups)

| # | Step | Expected result |
|---|------|------------------|
| A1 | Send **List Countries** | 200, returns Pakistan/United Kingdom/United States |
| A2 | Send **List Corridors (catalog)** | 200, returns 4 corridors, each with nested `country` and `payoutCurrency` objects |
| A3 | Send **Corridor Facets** with no query params filled in | 200, `totalAvailable` = `totalMatched` = 4 |
| A4 | Send **Corridor Facets** with `serviceCode=card` | 200, `totalMatched` drops to 1, but `totalAvailable` stays 4 (it's the fixed denominator, not a filtered count — see the `services` list, which still shows all 3 service codes with their real counts since it's not the filtered dimension) |
| A5 | Send **Corridor Facets** with `regionId=1` | 200, `totalMatched` = 2, the `countries` list narrows to just that region's country |

## B. Quote CRUD with the new fields

| # | Step | Expected result |
|---|------|------------------|
| B1 | Send **Create Quote** (the example body already includes `fundingCurrencyIds`, `sourceCurrencyIds`, `useCaseIds`) | 201, response includes `fundingCurrencies` (2 items), `sourceCurrencies` (1 item), `useCases` (1 item) — arrays, not single objects |
| B2 | Send **Show Quote** (uses `{{quote_id}}` saved from B1) | 200, `quote.fundingCurrencies`/`sourceCurrencies`/`useCases` all present as arrays; `quote.icpLevel1`/`icpLevel2`/`icpLevel3` present (null if not set) |
| B3 | Send **Update Quote** with a body like `{"fundingCurrencyIds": [1]}` | 200, `fundingCurrencies` in the response now has only 1 item — confirms updating **replaces** the set, not appends to it |
| B4 | Try creating a quote with a `fundingCurrencyIds` value that doesn't exist (e.g. `[999999]`) | 422 validation error, not a 500 or silent success |
| B5 | Try creating a quote with `icpLevel1Id` pointing at a currency id instead of a real ICP node id (an obviously wrong id) | 422 validation error |

## C. Corridors on a quote (regression — should be unaffected by this change)

| # | Step | Expected result |
|---|------|------------------|
| C1 | Send **Add Corridor to Quote** | 201, computed `totalRevenue`/`totalMargin`/`takeRatePct` present |
| C2 | Send **Update Quote Corridor** | 200, numbers recompute from the new inputs |
| C3 | Send **Remove Corridor from Quote** | 204 |
| C4 | Send **Delete Quote** | 204 |

## D. Regression

| # | Step | Expected result |
|---|------|------------------|
| D1 | `cd apps/server && node ace test` | All tests pass (44 as of this writing) |
| D2 | `npx turbo run build typecheck lint test` from repo root | All 3 workspaces pass |
| D3 | Run the whole Postman collection top-to-bottom (Runner, or manually in order) | All requests succeed, ending with **Cleanup → Logout** returning 204 |

## Sign-off

- [ ] A, B, C, D all pass
- [ ] You understand the `totalAvailable` vs `totalMatched` distinction on the facets endpoint (fixed denominator vs. filtered count)
- [ ] Ready to commit
