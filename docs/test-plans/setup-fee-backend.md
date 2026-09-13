# Test Plan: Setup Fee Backend (FEATURES.md item #4, Phase 2)

Covers the new `quote_setup_fees` (+4 child tables) schema and the `GET/PUT /quotes/:id/setup-fee` endpoint. Use Postman (import `postman/STRIKE.postman_collection.json` + environment) — request names below match the collection exactly (**Quotes → Get Setup Fee** / **Update Setup Fee**). You'll need to hand-edit the request body in Postman for several rows below; the saved example only covers the happy path.

## Setup

1. Make sure migrations + seed data are current:
   ```bash
   cd apps/server
   node ace migration:run --force
   node ace db:seed
   ```
2. Start the server: `npm run dev` (http://localhost:3334)
3. In Postman, select the "STRIKE - Local" environment, run **Auth → Login** to populate `{{token}}`, then **Quotes → Create Quote** to populate `{{quote_id}}` (use a fresh quote for this test plan rather than reusing one from other testing).

## A. Before anything is saved

| # | Step | Expected result |
|---|------|------------------|
| A1 | Send **Get Setup Fee** | 200, body is exactly `{"setupFee": null}` |

## B. Happy path

| # | Step | Expected result |
|---|------|------------------|
| B1 | Send **Update Setup Fee** with its saved example body unchanged | 200. `setupFee.feeType` = `"setup"`, `finalCommitmentFee` = `5000`, `year1CommitmentFees` = `60000`, `year1CommittedRevenue` = `160000`, `totalContractValue` = `160000`, `needsApproval` = `false`, `otherFees` has 7 items each with a real `id` |
| B2 | Send **Get Setup Fee** again | 200, `setupFee` now returns the same data B1 saved (not null) — confirms it persisted |
| B3 | Send **Update Setup Fee** again, changing only `quotedPrice` to `40000` | 200, `totalContractValue` drops accordingly (`106000`) — confirms **updating replaces** the record rather than creating a second one (check via B2 again: still only one set of `otherFees`, not duplicated) |

## C. Validation the backend enforces (all should be rejected, not silently accepted)

| # | Step | Expected result |
|---|------|------------------|
| C1 | Set `waivedMonths` to `24` (the old app's own input field claimed 24 was the max — it wasn't, real cap is 6) | 422 |
| C2 | Set `paymentSchedule` to `"custom"` and add `paymentMilestones: [{"milestone":"On Signature","percentage":50},{"milestone":"Within 90 days","percentage":40}]` (sums to 90, not 100) | 422, error message mentions "exactly 100%" |
| C3 | Fix C2 so the two milestones sum to 100 (e.g. 60/40) | 200 — confirms the check is real math, not a blanket rejection |
| C4 | Set `mcfType` to `"principal"` but omit `mcfPrincipalSlots` entirely | 422 |
| C5 | Set `feeType` to `"invalid_value"` (not `setup`/`network`) | 422 |
| C6 | Send **Update Setup Fee** pointed at a `quote_id` that doesn't exist (edit the URL) | 404 |

## D. Draft-only editing (matches every other quote-editing endpoint)

| # | Step | Expected result |
|---|------|------------------|
| D1 | Manually flip the quote's status away from `draft` (there's no endpoint for this yet — use `psql` or your DB tool: `update quotes set status='submitted' where id = <quote_id>;`) | — |
| D2 | Send **Update Setup Fee** | 409 |
| D3 | Send **Get Setup Fee** | Still 200 — viewing is allowed regardless of status, only editing is blocked |
| D4 | Revert: `update quotes set status='draft' where id = <quote_id>;` | — |

## E. Approval logic (the part most worth double-checking by hand)

| # | Step | Expected result |
|---|------|------------------|
| E1 | With the quote's Opportunity Type left as default ("New partner" if you didn't set one on Create Quote), set `otherFees` to just `[{"conceptCode":"reversal_request","amount":999,"isPercentage":false}]` | 200, `needsApproval` = `true`, one reason mentioning `reversal_request` |
| E2 | Set `rebateIncentive` to `true` | 200, `needsApproval` = `true`, a reason mentioning "Rebate incentive" |
| E3 | Set `waivedMonths` to `4` | 200, `needsApproval` = `true`, a reason mentioning "4 waived months" |
| E4 | Set `quotedPrice` to `0` and `standardCommitmentFee` to `0` (drives Year-1/TCV below threshold) | 200, `needsApproval` = `true`, reasons mention both the $75k and $150k minimums |
| E5 | Now update the quote itself so `opportunityType` = `"Upsell"` (`PATCH /quotes/:id` with `{"opportunityType":"Upsell"}`, or **Update Quote** in Postman), then repeat E4's exact setup-fee body | 200, `needsApproval` = `false`, `approvalReasons` = `[]` — confirms Upsell bypasses every check above, even with values that would otherwise fail every threshold |

## F. Access control (matches the pattern used everywhere else)

| # | Step | Expected result |
|---|------|------------------|
| F1 | Log in as a second, different user (create one with `node ace create:user` if needed) and try **Get/Update Setup Fee** on the first user's quote | 403 for both |
| F2 | Log in as an admin and repeat F1 | 200 — admins can access any quote's setup fee |

## G. Regression

| # | Step | Expected result |
|---|------|------------------|
| G1 | `cd apps/server && node ace test` | All tests pass (57 as of this writing) |
| G2 | `npx turbo run build typecheck lint test` from repo root | All workspaces pass |
| G3 | Send **Delete Quote** to clean up the test quote used above | 204 |

## Sign-off

- [ ] A–G all pass
- [ ] You understand why Upsell quotes never require setup-fee approval (E5) — it's an intentional rule carried over from the old app, not a bug
- [ ] Ready to move on to the Setup Fee frontend
