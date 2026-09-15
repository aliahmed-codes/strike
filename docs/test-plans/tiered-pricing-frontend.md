# Test Plan: Tiered Pricing Frontend (FEATURES.md Phase 1b item 3)

Covers the per-corridor Standard/Tiered toggle and tier editor on the Pricing tab. Do this in the browser at `http://localhost:5173`, logged in as `admin@strike.test` / `Password123`.

## Setup

Open **"Acme Corp - LATAM Payout Expansion"** → Pricing tab — its second corridor is already set to "Tiered" with 2 example tiers, so you can see the feature working immediately without setting anything up.

## A. Viewing an existing tiered corridor

| # | Step | Expected result |
|---|------|------------------|
| A1 | Open the corridor already set to "Tiered" | The "Pricing" column shows a "Tiered" dropdown and an "Edit tiers" button |
| A2 | Click "Edit tiers" | An expanded panel appears below the row showing 2 tiers, each with its own Volume/Fixed Fee/Variable Fee %/FX Spread, plus a "Standard remainder" readout |
| A3 | Check the row's Revenue/FX Margin %/Margin Fee/Gross Margin %/Take Rate columns | These reflect the combined total across both tiers and the standard remainder — not just the standard fields shown in the main row inputs |

## B. Real-time preview while editing tiers

| # | Step | Expected result |
|---|------|------------------|
| B1 | With the tier editor open, change Tier 1's Volume | The row's Revenue/Margin/Approval columns above update **immediately**, before clicking "Save tiers" |
| B2 | Increase a tier's Volume until tiers exceed the corridor's total Yearly Volume | A red validation message appears ("Tier volumes total $X, which exceeds...") and "Save tiers" becomes disabled |
| B3 | Lower it back under the total | The error disappears, "Save tiers" re-enables |
| B4 | Change the main row's Yearly Volume input (not a tier) | The "Standard remainder" readout in the tier panel updates live too |

## C. Save and reload

| # | Step | Expected result |
|---|------|------------------|
| C1 | Change a tier's Fixed Fee, click "Save tiers" | Saves successfully; the row's numbers stay exactly what the live preview showed |
| C2 | Refresh the page, reopen the quote, expand tiers again | The saved tier values reload correctly, matching what you saved |

## D. Adding, removing, and switching pricing model

| # | Step | Expected result |
|---|------|------------------|
| D1 | Click "Add tier" | A new Tier 3 appears (or the next unused tier number), starting at $0 |
| D2 | Add a third tier when 3 already exist | "Add tier" is disabled — max 3 tiers |
| D3 | Click "Remove tier" on one | That tier disappears from the editor (not yet saved until "Save tiers") |
| D4 | On a different, standard-priced corridor, switch its "Pricing" dropdown to "Tiered" | It immediately saves (no separate button needed for the toggle itself) and the "Edit tiers" panel opens automatically, empty (100% at standard) |
| D5 | Switch a tiered corridor's dropdown back to "Standard" | Saves immediately; the tier editor and its tiers disappear; the row's numbers now reflect only the standard fields |

## E. Regression

| # | Step | Expected result |
|---|------|------------------|
| E1 | A plain standard corridor (no tiers) still behaves exactly as before — live preview, inline edits, approval badges | No change in behavior |
| E2 | `cd apps/server && node ace test` | All 79 tests pass |
| E3 | `npx turbo run build typecheck lint test` from repo root | All 4 workspaces pass |

## Sign-off

- [ ] A–E all pass
- [ ] The live preview genuinely updates while editing tiers, without needing to save first
- [ ] Ready to commit
