# Test Plan: Pricing Tab Field-Parity Pass (FEATURES.md Phase 1b item 3.5)

Covers the additional fields added to match the old app's Pricing tab: Funding Currency, ATV, Margin Fee % / Margin % (two distinct metrics — see section E, a real bug fix), Std Fixed/Variable Fee reference, Fee Discount % as a visible column, and the new "Details" panel (cost data, Historical ATV, fee currency conversion). Do this in the browser at `http://localhost:5173`, logged in as `admin@strike.test` / `Password123`.

## A. New columns

| # | Step | Expected result |
|---|------|------------------|
| A1 | Open any quote's Pricing tab with a corridor added | Table now shows "Funding Currency" (editable dropdown), "Std Fixed Fee"/"Std Variable Fee %" (read-only, grey text), and "ATV (USD)" (editable) columns |
| A2 | Check "Fee Discount %" | Now a visible, editable input column (previously only settable when first adding a corridor) |
| A3 | Check "Margin Fee %" and "Margin %" | Both now appear as separate columns (previously only one, mislabeled — see section E) |
| A4 | Edit Fee Discount % on an existing row, click away | Saves; Revenue/Margin numbers update to reflect the discount |
| A5 | Change Funding Currency on a row | Saves immediately (no blur needed, matches other dropdowns); Details panel's "Fixed Fee in [currency]" updates to the new currency |
| A6 | Edit ATV (USD), click away | Saves; if the corridor is Tiered, tier transaction counts (derived from volume ÷ ATV) recompute live |

## E. Margin Fee % vs Margin % (bug fix — worth confirming carefully)

| # | Step | Expected result |
|---|------|------------------|
| E1 | Find or create a corridor with a positive FX Margin (most corridors with a nonzero FX Spread) | "Margin %" should read **higher** than "Margin Fee %" — Margin % includes the FX margin, Margin Fee % doesn't |
| E2 | Set Applied FX Spread to exactly the corridor's Treasury FX Cost (or 0 for a Cost-Plus corridor with spread 0) so FX Margin is 0 or negative | "Margin Fee %" and "Margin %" should now read **the same** |
| E3 | Compare against the old app on an identical input scenario, if you have it open side by side | Both numbers should match the old app's own "Margin Fee %" and "Margin %" columns exactly |

## B. Details panel

| # | Step | Expected result |
|---|------|------------------|
| B1 | Click "Details" under a corridor's name | An expanded panel appears showing Treasury FX Cost Spread %, Fixed Cost (USD), Variable Cost %, Historical ATV, and "Fixed Fee in [currency]" |
| B2 | On a corridor with no Historical ATV match | Shows "No data", not a fabricated 0 |
| B3 | On a corridor with a funding currency NOT in our 14-currency rate table (e.g. most African/Asian currencies) | Fee-in-currency shows "No rate available", not a wrong 1:1 conversion |
| B4 | On a corridor with USD or a covered currency (e.g. AUD, EUR, GBP) as funding currency | Shows a real converted amount |
| B5 | Click "Hide details" | Panel collapses |

## C. Add a Corridor preview

| # | Step | Expected result |
|---|------|------------------|
| C1 | Select a corridor in "Add a Corridor" | A small panel shows that corridor's Std Fixed Fee, Std Variable Fee %, and Historical ATV (or "No data") as reference, before you've typed anything |
| C2 | Check the live preview stats below | Now includes "Margin %" alongside the existing Revenue/FX Margin %/Margin Fee/Gross Margin %/Take Rate |

## D. Regression

| # | Step | Expected result |
|---|------|------------------|
| D1 | Standard (non-tiered) corridors still price/save/reload correctly | No change in behavior |
| D2 | Tiered corridors (from the previous pass) still work — tier editor, live preview, save | No change in behavior |
| D3 | `cd apps/server && node ace test` | All 80 tests pass |
| D4 | `npx turbo run build typecheck lint test` from repo root | All 4 workspaces pass |

## Sign-off

- [ ] A–E all pass
- [ ] "No data" / "No rate available" show honestly instead of fake numbers where the old app would have shown something misleading
- [ ] Margin Fee % and Margin % are confirmed as genuinely different numbers when FX margin is positive
- [ ] Ready to commit
