# Test Plan: Dashboard Shell UI (FEATURES.md item #8)

Manual test plan for the app shell (header/nav) and the mock-data Dashboard. No backend to test here — this is a UI-only pass — so this is entirely a browser walkthrough.

**Result: user tested this end-to-end in a browser and confirmed it works.** Individual rows below are left as the checklist that was tested, not re-annotated one by one.

## Setup

1. Start both apps:
   ```bash
   cd apps/server && npm run dev   # http://localhost:3334
   cd apps/client && npm run dev   # http://localhost:5173
   ```
2. Log in with `qa@example.com` / `password123` (or create your own via `node ace create:user`).

## A. App shell (header + nav)

| # | Step | Expected result | Result |
|---|------|------------------|--------|
| A1 | Look at the header | Thunes logo + "STRIKE" wordmark on the left; "Powered By" + BuyFRAME logo, a notification bell (with a badge), and your name/email + avatar on the right | ⏳ pending |
| A2 | Click your avatar/name (top right) | A dropdown opens showing your name and a "Log out" option | ⏳ pending |
| A3 | Click "Log out" from that dropdown | Logs out and redirects to `/login` (same as the Home page's logout did before) | ⏳ pending |
| A4 | Log back in, look at the nav bar | Three tabs: Dashboard, Pricing Requests, Approvals — "Dashboard" is active (colored, underlined) | ⏳ pending |
| A5 | Click "Pricing Requests" | Navigates there, tab underline animates/slides to it, page shows a "This section hasn't been built yet" placeholder — not a blank page or a crash | ⏳ pending |
| A6 | Click "Approvals" | Same as A5 — placeholder, underline slides again | ⏳ pending |
| A7 | Click "Dashboard" to go back | Underline slides back, real dashboard content reappears | ⏳ pending |

## B. Dashboard content

| # | Step | Expected result | Result |
|---|------|------------------|--------|
| B1 | Load the Dashboard fresh (refresh the page) | Briefly shows a pulsing skeleton placeholder, then the real content fades in — not an instant jump, not a long blank wait | ⏳ pending |
| B2 | Watch the stat tile numbers (Total Volume, Total Transactions, etc.) as the page loads | Numbers count up from 0 to their final value rather than just appearing | ⏳ pending |
| B3 | Check the "Payment Metrics" panel's 6 stat tiles | Total Volume ($6,000,000), Total Transactions (20,000), ATV ($300), FX Margin ($120,000, light green tile), FX Margin % (2.0%, light green tile), Take Rate (2.87%, light blue tile) | ⏳ pending |
| B4 | Check "Revenue Breakdown" bars | 4 bars (Transaction Fees $52,240, FX Margin $120,000, Monthly Fees $72,000, Setup Fees $100,000), each animating its width in on load | ⏳ pending |
| B5 | Check "Performance by Region" table | 4 rows (Africa, Asia, Europe, Americas) with volume/transactions/growth %, growth shown in green | ⏳ pending |
| B6 | Check the "Corridor Status" panel's 3 stat tiles | Active Corridors (28), Pending Activation (7), Service Types (4) | ⏳ pending |
| B7 | Check "Top Corridors by Volume" table | 3 rows (Nigeria/Mobile Wallet, India/Bank Account, United Kingdom/Card) | ⏳ pending |
| B8 | Check "Recent Activations" | 3 rows (Kenya-M-Pesa, Philippines-GCash, Mexico-Bank Transfer) with colored status badges — green "Active" x2, amber "Pending" x1 | ⏳ pending |
| B9 | Check "Service Distribution" bars | 4 bars (Bank Account 42%, Mobile Wallet 35%, Card 18%, Cash Pickup 5%), widths clearly proportional to each other | ⏳ pending |
| B10 | Hover over any stat tile | Tile lifts slightly with a shadow (not static/dead) | ⏳ pending |
| B11 | Click "Create Pricing Request" (top right) | Navigates to the Pricing Requests placeholder — doesn't error or do nothing | ⏳ pending |

## C. Regression

| # | Step | Expected result | Result |
|---|------|------------------|--------|
| C1 | `npx turbo run build typecheck lint test` from repo root | All 3 workspaces pass | ✅ pass (already run by Claude) |
| C2 | Resize the browser window narrower (mobile-ish width) | Layout doesn't visibly break — panels stack, header doesn't overflow | ⏳ pending |

## Sign-off

- [x] All of A, B, C pass (or noted issues are acceptable for a mock-data demo pass)
- [x] Animations feel smooth, not janky or too slow/fast
- [x] Ready to commit
