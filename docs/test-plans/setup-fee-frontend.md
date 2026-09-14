# Test Plan: Setup Fee Frontend (FEATURES.md item #4, Phase 2)

Covers the Setup Fee tab UI: all 5 sections, real-time validation/preview (matching the old app's live behavior), and the two schema cleanups done in this pass (removed the duplicate `waivedMonths` field, moved the commitment-fee math into `@strike/shared` so frontend/backend can never drift apart). Do this in the browser at `http://localhost:5173`, logged in as `admin@strike.test` / `Password123`.

## Setup

1. `cd apps/server && node ace migration:fresh --seed` (picks up the dropped `quotes.waived_months` column), then recreate your login if needed: `node ace create:user --email=admin@strike.test --first-name=Admin --last-name=User --password=Password123 --role=admin`.
2. Start both dev servers (`npm run dev` from the repo root, or each app individually).
3. Create a fresh Pricing Request, fill in a name, save it (Setup Fee needs a real quote id), then open the **Setup Fee** tab.

## A. Duplicate field removed

| # | Step | Expected result |
|---|------|------------------|
| A1 | Open the **Summary** tab | There is no longer a "Waived Months (Commitment fee)" field here — it only lives on the Setup Fee tab now |
| A2 | Open **Setup Fee** → Monthly Commitment Fee section | "Waived Months" field is here, this is now the only place it exists |

## B. Real-time Waived Months validation

| # | Step | Expected result |
|---|------|------------------|
| B1 | Type `4` into Waived Months | No warning; caption still reads "0-6; 4 or more requires approval" |
| B2 | Type `6` | Still accepted, no warning |
| B3 | Type `7` or higher | Value is immediately clamped back to `6`, the field border turns red, and "Max 6 months allowed." appears below it — **no need to click Save to see this** |
| B4 | Clear the warning by typing `2` | Red state and message disappear immediately |

## C. Real-time Custom Payment Schedule gating

| # | Step | Expected result |
|---|------|------------------|
| C1 | With Quoting Price at `0` (or anything ≤ $75,000), open the Payment Schedule dropdown | "Custom" is greyed out/unselectable; a caption under the field explains the $75,000 requirement |
| C2 | Set Quoting Price to `80000` | Payment Schedule caption disappears, "Custom" becomes selectable |
| C3 | Select "Custom", then lower Quoting Price back to `50000` | Payment Schedule **silently snaps back to "On Contract Signature - 100%"** immediately (no save needed) — matches the old app's real-time reset rule |

## D. Real-time computed summary & threshold cards (the main ask)

| # | Step | Expected result |
|---|------|------------------|
| D1 | With nothing filled in yet, look at "Computed Summary" | It's already visible (not hidden until after a save) showing $0 everywhere, and two cards: "Year 1 Contract Value" and "Total Contract Value", both **red**, both reading "Below $75,000 minimum - Needs Approval" / "Below $150,000 minimum - Needs Approval" |
| D2 | Set Quoting Price to `200000`, Commitment Fee Type = Standard, Monthly Commitment Fee = `10000` | Watch the numbers update **as you type**, no Save click needed. Year 1 Contract Value card should turn **green**: "Meets $75,000 minimum" |
| D3 | Keep watching Total Contract Value | With a 1-year contract, $200,000 + (12 × $10,000) = $320,000 → green, "Meets $150,000 minimum" |
| D4 | Lower Quoting Price to `10000` | Both cards should immediately flip back to red with the correct numbers — again, live, before any Save |
| D5 | Switch Commitment Fee Type to "Volume / Principal Based" and fill in the 2-3 slots with real numbers | Computed Summary updates live using the principal-slot math instead |

## E. Save still works and matches the live preview

| # | Step | Expected result |
|---|------|------------------|
| E1 | With the values from D2/D3 still in place, click "Save Setup Fee" | Saves successfully; the numbers shown after save match exactly what the live preview showed beforehand |
| E2 | Refresh the page, reopen Setup Fee | The saved values reload correctly into the form, and the live preview immediately shows the same numbers again |

## F. Regression (existing sections still work)

| # | Step | Expected result |
|---|------|------------------|
| F1 | Add 2 custom payment milestones summing to 100% | Saves fine (green "100% of 100%" indicator) |
| F2 | Add 2 custom milestones summing to 90% and try to Save | Backend rejects with a visible error banner mentioning "exactly 100%" |
| F3 | Fill in a few "Other Fees" values, save, reload | Values persist correctly, including the Treasury Management currency picker |
| F4 | Set Rebate Incentive to YES | Rebate Type dropdown appears |
| F5 | `cd apps/server && node ace test` | All 57 tests pass |
| F6 | `npx turbo run build typecheck lint test` from repo root | All 4 workspaces pass |

## Sign-off

- [ ] A–F all pass
- [ ] The threshold cards and computed summary genuinely update live, without needing to click Save first
- [ ] Ready to commit

---

# How to verify the new app matches the old app

Since the old app computes all of this client-side too, you can compare them directly, corridor-for-corridor:

1. **Open both apps side by side** — old app (wherever you run it) and new app at `http://localhost:5173`.
2. **Pick one quote/quoting scenario** and enter **identical inputs** into both: same Quoting Price, same Payment Schedule, same Commitment Fee Type and amount/rate, same Waived Months, same contract length.
3. **Compare these specific numbers**, which should match exactly between the two apps:
   - Final/Monthly Commitment Fee
   - Year 1 Commitment Fees
   - Year 1 Committed Revenue (old app calls this "Year 1 Contract Value")
   - Total Contract Value (old app sometimes also calls this "Total Committed Revenue" — same number, see below)
   - Whether each threshold card shows red ("Below $X minimum") or green ("Meets $X minimum") — should flip at the exact same dollar amount ($75,000 and $150,000) in both apps
4. **Specific behaviors to click through in both apps and compare**:
   - Type Waived Months past 6 in both — both should refuse to accept anything over 6 and show a message immediately.
   - Set a low Quoting Price (≤$75,000) in both — "Custom" payment schedule should be unavailable in both.
   - Select Custom in both, then drop Quoting Price below $75,000 in both — both should silently revert to the standard 100% schedule.
   - Set Opportunity Type to "Upsell" in both, then deliberately enter values that would normally trigger approval (e.g. Quoting Price $0) — neither app should show a "needs approval" indicator for an Upsell quote.
5. **One known, intentional difference** — don't be alarmed by this one: the old app's displayed "corridors match" count on the Summary tab doubles when 2 Funding Currencies are selected (a display quirk, already replicated exactly in Phase 1 — see FEATURES.md). That's unrelated to Setup Fee but is the one place the two apps deliberately show a multiplier; every other number described here should match 1:1 with no multiplier.
6. If any number or behavior differs between the two apps, that's a real bug in one of them worth reporting — given the new app's math is centralized in one shared, tested file (`packages/shared/src/lib/setup_fee_math.ts`) and covered by 10 backend tests, start by double-checking the old app's own console/dev tools for the same computation before assuming the new app is wrong.
