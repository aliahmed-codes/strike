# Test Plan: P&L Tab Frontend (FEATURES.md — Remaining quote tabs, Step 2)

Covers the new P&L tab: the save-draft-first gate, the two growth inputs, the live preview (computed client-side via the same `computeQuotePnl` function the backend uses — never a network call per keystroke), the fixed 3-year projection, and the approval banner. Do this in the browser at `http://localhost:5173`.

## Setup

1. Start both dev servers (`npm run dev` from the repo root, or each app individually).
2. Log in (create a user first if needed: `cd apps/server && node ace create:user --email=admin@strike.test --first-name=Admin --last-name=User --password=Password123 --role=admin`).
3. Create a fresh Pricing Request, fill in a name, click **Save Draft** (P&L needs a real quote id — same gate as Setup Fee/Pricing).
4. Open the **Pricing** tab and add at least one corridor with real volume/fee/spread values so P&L has something to aggregate. Note the corridor's Total Revenue/Total Margin shown there — you'll compare against Year 1 below.
5. Open the **P&L** tab.

## A. Save-draft-first gate

| # | Step | Expected result |
|---|------|------------------|
| A1 | Open P&L on a brand-new, never-saved Pricing Request (before clicking Save Draft) | Dashed placeholder card: "Save the draft first" — same copy style as Setup Fee/Pricing |
| A2 | Click Save Draft, then reopen P&L | Real tab content loads instead of the placeholder |

## B. Year 1 matches saved corridor pricing

| # | Step | Expected result |
|---|------|------------------|
| B1 | With one saved corridor from Setup step 4, open P&L | Year 1's Fee Revenue/FX Margin/Total Revenue/Total Margin match that corridor's numbers on the Pricing tab exactly (no growth applied to Year 1, ever) |
| B2 | Go back to Pricing, add a **second** corridor with `yearlyVolumeUsd = 0` | Reopen P&L — Year 1 totals are **unchanged**; the zero-volume corridor contributes nothing (matches the documented D2 rule) |
| B3 | Delete the zero-volume corridor (bulk delete or single delete) | Year 1 stays unchanged (it was already excluded) |

## C. Live preview — no network call per keystroke

| # | Step | Expected result |
|---|------|------------------|
| C1 | Open your browser's Network tab, then type `10` into "Year 2-over-1 Growth %" | Year 2's Principal/Fee Revenue/FX Margin/Total Revenue/Total Margin all update **immediately** as you type, a small "Showing an unsaved live preview — click 'Save Draft' at the top of the page to persist" note appears, and the page-level "You have unsaved changes" banner appears too — **no new HTTP request fires** in the Network tab for this |
| C2 | Type `5` into "Year 3-over-2 Growth %" | Year 3 updates live the same way, compounding on top of Year 2's already-grown numbers |
| C3 | Reload the page without saving | The draft growth values are still there (unsaved edits now persist across a reload, same as the header's own unsaved-field behavior) — but if you instead want to discard them, there's currently no explicit "discard" action; only reopening in a state where the draft was never set (e.g. a different quote) starts clean |

## D. Explicit 0% growth stays flat (not a hidden default)

| # | Step | Expected result |
|---|------|------------------|
| D1 | With Year 2 Growth explicitly set to `0` and Year 3 Growth explicitly set to `0`, click **Save Draft** | Year 2 and Year 3 numbers exactly equal Year 1's numbers — never inflated by a hidden 15% default the way the old app's Quoting Summary tab used to |
| D2 | Refresh the page, reopen P&L | Growth inputs still show `0`/`0`, and Year 2/3 still equal Year 1 |

## E. Growth compounds correctly

| # | Step | Expected result |
|---|------|------------------|
| E1 | Set Year 2 Growth to `10`, Year 3 Growth to `20`, note Year 1's Principal value (call it `P`) | Year 2 Principal = `P × 1.10` |
| E2 | Check Year 3 | Year 3 Principal = `P × 1.10 × 1.20` (compounds on Year 2, not on Year 1 directly) |

## F. Validation

| # | Step | Expected result |
|---|------|------------------|
| F1 | Type `99999` into Year 2 Growth | Field border turns red immediately, with a message below it ("Must not be greater than 500") — client-side, no round trip |
| F2 | Type `-150` into Year 2 Growth | Same red behavior, message about the minimum (-100) |
| F3 | Correct the value back to something in range, e.g. `10` | Red state clears immediately |
| F4 | With an out-of-range value still in the field, click **Save Draft** anyway | The header (and Setup Fee, if valid) still saves — P&L's invalid value is rejected by the backend and its own red message stays/updates under the field; nothing about P&L gets silently accepted |

## G. Setup Fee integration

| # | Step | Expected result |
|---|------|------------------|
| G1 | Go to Setup Fee, set a Quoting Price (e.g. `50000`), save it | Reopen P&L — Year 1's "Setup / Network Joining Fee" row shows `$50,000`, and Year 2/3 show `$0` for that row (one-off, Year 1 only) |
| G2 | On Setup Fee, set a Monthly Commitment Fee with some per-period overrides, save | Reopen P&L — the "Monthly Commitment Fee" row differs by year according to the real schedule, not a flat guess |

## H. Approval banner only updates after Save

| # | Step | Expected result |
|---|------|------------------|
| H1 | Note whether the amber "requires approval" banner is showing or not | This reflects only the **last saved** state |
| H2 | Change the growth inputs so the live preview would clearly cross an approval threshold (e.g. a large negative growth driving margin down), but don't click **Save Draft** | The banner does **not** change — it stays exactly as it was before you started typing |
| H3 | Click **Save Draft** | Banner now updates to reflect the newly saved numbers |

## I. One save button — "Save Draft" persists P&L too

There is now only **one** save action on this page (same fix as Setup Fee): the old separate "Save
P&L" button is gone.

| # | Step | Expected result |
|---|------|------------------|
| I1 | Look at the whole page | Exactly one button anywhere reads "Save"/"Save Draft" |
| I2 | Set both growth values, click **Save Draft** | Button shows "Saving…" then returns to normal; the "unsaved preview" note and the page-level "unsaved changes" banner both disappear since the displayed numbers now equal the saved ones |
| I3 | Refresh the page, reopen P&L | Growth inputs and all Year 1/2/3 numbers reload exactly as saved |
| I4 | Switch to another tab and back to P&L without saving an in-progress edit | The edit is still there — it survives switching tabs now, not just full reloads |

## J. Regression

| # | Step | Expected result |
|---|------|------------------|
| J1 | `cd apps/server && node ace test` | All 148 backend tests pass |
| J2 | `npx turbo run build typecheck lint` from repo root | All 3 workspaces pass |

## Sign-off

- [ ] A–J all pass
- [ ] The live preview genuinely never round-trips to the server while typing
- [ ] An explicit 0% growth never gets silently replaced with a default
- [ ] Only one Save button exists, and it actually persists P&L edits, verified across a full reload
- [ ] Ready to commit
