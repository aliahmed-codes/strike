# Test Plan: Pricing Tab Phase 1b (real FX Margin/Margin Fee/Gross Margin + split approval)

Covers the 3 new columns and the split Financial/Network approval badges on the Pricing tab, plus real-time preview matching the old app's live behavior. Do this in the browser at `http://localhost:5173`, logged in as `admin@strike.test` / `Password123`.

## Setup

Sample quotes already exist under this account (created for this pass):
- **"Acme Corp - LATAM Payout Expansion"** — a clean quote with 2 corridors, no approval needed.
- **"GlobalTrans - SWIFT Wire Corridor (Needs Approval)"** — 2 corridors that trigger both approval types.
- **"Draft - Untitled Pricing Request"** — empty, for testing the Add-Corridor flow from scratch.

## A. New columns show real numbers

| # | Step | Expected result |
|---|------|------------------|
| A1 | Open "Acme Corp - LATAM Payout Expansion" → Pricing tab | Table now shows FX Margin %, Margin Fee, Gross Margin % columns alongside Revenue/Take Rate |
| A2 | Compare the numbers to what's in the database (or trust the automated test suite — 65/65 passing, including live-verified hand calculations against 4 real corridors) | Numbers are non-zero, sensible (no NaN/Infinity), and Gross Margin % is a reasonable percentage |

## B. Split approval badges

| # | Step | Expected result |
|---|------|------------------|
| B1 | Open "GlobalTrans - SWIFT Wire Corridor (Needs Approval)" → Pricing tab | The SWIFT wire corridor row shows two badges: "Financial" and "Network" (not one generic "Needed") |
| B2 | Click the "Financial" badge | A popover opens listing the specific reasons (e.g. "Gross margin of -400% is negative") |
| B3 | Click the "Network" badge | A popover opens listing its own reasons (e.g. "Corridor catalog flags...", "Internal restriction: ...") — different from Financial's reasons |
| B4 | Open "Acme Corp" (the clean quote) | Approval column shows "—" for both corridors, no badges |

## C. Real-time preview — Add a Corridor

| # | Step | Expected result |
|---|------|------------------|
| C1 | Open "Draft - Untitled Pricing Request" → Pricing tab → "Add a Corridor" | Selecting a corridor and typing in Yearly Volume/Fees immediately shows a live preview panel (Revenue, FX Margin %, Margin Fee, Gross Margin %, Take Rate, Approval) below the form — **before clicking "Add Corridor"** |
| C2 | Change any input field | The preview updates immediately, no save/click needed |
| C3 | Pick a corridor known to need approval (e.g. corridor id 55 from the SWIFT quote) with default $0 inputs | The live preview's Approval area shows Financial/Network badges before you've even clicked Add |
| C4 | Click "Add Corridor" | The row appears in the table above with numbers matching exactly what the live preview showed |

## D. Real-time preview — editing an existing row

| # | Step | Expected result |
|---|------|------------------|
| D1 | On any existing corridor row, change "Yearly Volume" (don't click away yet) | Revenue/FX Margin %/Margin Fee/Gross Margin %/Take Rate/Approval in that same row update immediately as you type — no need to click away first |
| D2 | Click away (blur) | The change saves; refresh the page — the same updated numbers reload correctly |
| D3 | Change a field, then change it back to the original value before blurring | No visible flicker/error; saving is a no-op effectively (still safe to blur) |

## E. Regression

| # | Step | Expected result |
|---|------|------------------|
| E1 | Remove a corridor | Still works, row disappears |
| E2 | `cd apps/server && node ace test` | All 65 tests pass |
| E3 | `npx turbo run build typecheck lint test` from repo root | All 4 workspaces pass |

## Sign-off

- [ ] A–E all pass
- [ ] The live preview genuinely updates without a save, both when adding a new corridor and editing an existing one
- [ ] Ready to commit
