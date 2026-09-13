# Test Plan: Authentication (FEATURES.md item #3)

Manual test plan for the login/logout/session feature. Run this end-to-end before marking item #3 fully done. Each row: what to do, what you should see.

## Setup

1. Make sure Postgres is reachable (native or `docker compose up`) and migrations are current:
   ```bash
   cd apps/server
   node ace migration:run --force
   ```
2. Create a known-good test account:
   ```bash
   node ace create:user --email=qa@example.com --first-name=QA --last-name=Tester --password=password123 --role=sales
   ```
3. Start both apps:
   ```bash
   cd apps/server && npm run dev   # http://localhost:3334
   cd apps/client && npm run dev   # http://localhost:5173
   ```

## A. Backend, via Postman (or curl) — ✅ executed by Claude, all passed

Import `postman/STRIKE.postman_collection.json` + `postman/STRIKE.postman_environment.json`, select the "STRIKE - Local" environment.

| # | Step | Expected result | Result |
|---|------|------------------|--------|
| A1 | Send **Login** with `qa@example.com` / `password123` | 200, response has `user` (firstName, lastName, email, role) and a `token`; `token` env var auto-populates | ✅ pass (via Newman) |
| A2 | Send **Login** with a wrong password | 400 | ✅ pass |
| A3 | Send **Login** with an email that doesn't exist | 400 (same error as A2 — doesn't reveal which emails exist) | ✅ pass |
| A4 | Send **Me** (right after A1) | 200, returns the same user you logged in as | ✅ pass (via Newman) |
| A5 | Send **Me** with no `Authorization` header (temporarily clear the `token` env var) | 401 | ✅ pass |
| A6 | Log in again (A1) to refresh the token, then send **Logout** | 204 | ✅ pass (via Newman) |
| A7 | Send **Me** again with that same (now-revoked) token | 401 — proves logout actually revoked it, not just cleared client-side | ✅ pass |

## B. Backend, account state edge cases (via `node ace` / SQL) — ✅ executed by Claude, all passed

| # | Step | Expected result | Result |
|---|------|------------------|--------|
| B1 | Run `node ace create:user` again with `qa@example.com` | Fails with "already exists" error, non-zero exit code | ✅ pass |
| B2 | Run `node ace create:user --email=bad --first-name=X --last-name=Y --password=123 --role=sales` | Fails, lists both the invalid-email and password-too-short errors | ✅ pass |
| B3 | Run `node ace create:user ... --role=owner` (invalid role) | Fails with "Invalid role" error | ✅ pass |
| B4 | Deactivate the QA user directly in the DB (`UPDATE users SET is_active=false WHERE email='qa@example.com'`), then try **Login** (A1) | 403, not 200 — then reactivate (`is_active=true`) so later steps still work | ✅ pass (reactivated afterward) |

## C. Frontend, in a real browser — ⏳ needs the user (Claude has no browser)

| # | Step | Expected result | Result |
|---|------|------------------|--------|
| C1 | Open `http://localhost:5173` while logged out | Redirects to `/login` | ⏳ pending |
| C2 | Look at the login page | Shows the Thunes logo, email/password fields, a **navy** "Sign in with Email" button, and a "Powered by" + BuyFRAME logo footer at the bottom — no "Register" link anywhere | ⏳ pending |
| C3 | Submit the login form with `qa@example.com` / wrong password | Stays on `/login`, shows a readable error message (not a raw JSON blob or a blank screen) | ⏳ pending |
| C4 | Submit the login form with `qa@example.com` / `password123` | Redirects to `/` (home), shows "Logged in as QA Tester (qa@example.com) — role: sales" | ⏳ pending |
| C5 | Refresh the page while on `/` | Stays logged in (session persists — doesn't bounce back to `/login`) | ⏳ pending |
| C6 | Click "Log out" | Redirects to `/login` | ⏳ pending |
| C7 | Try to navigate directly to `http://localhost:5173/` after logging out | Redirects to `/login` (doesn't briefly flash the home page's content first) | ⏳ pending |
| C8 | Open browser dev tools → Application/Storage → check `localStorage` | A `strike_token` key exists after login, is removed after logout | ⏳ pending |

## D. Cross-cutting / regression — ✅ executed by Claude, all passed

| # | Step | Expected result | Result |
|---|------|------------------|--------|
| D1 | `cd apps/server && node ace test` | All tests pass (11 as of this writing) | ✅ pass — 11/11 |
| D2 | `npx turbo run build typecheck lint test` from the repo root | All 3 workspaces pass with no errors | ✅ pass — 9/9 tasks |
| D3 | Check the browser tab title | Reads "STRIKE", not "PriceFRAME" or "client" | ✅ pass (confirmed in `index.html`) |

## Sign-off

- [ ] All of A, B, C, D pass
- [ ] No leftover test/demo accounts you care about (or note which ones exist for future reference)
- [ ] FEATURES.md item #3 status/notes reflect what was actually tested
- [ ] Ready to commit
