# Test plan: multiple funding currencies per corridor (Phase B frontend)

Prerequisites: a quote with 2 funding currencies selected on Summary's "Technical Pricing Details" (e.g. AUD and USD) and saved, plus Summary's "Corridors to Offer" filters set to match at least 1 corridor.

## A. One preview row per corridor per funding currency
1. Open the Pricing tab.
2. **Expected:** for each matching corridor, you see **2 preview rows** (one per funding currency), not 1 — e.g. "Norway · BankAccount · B2B · USD" appears twice, once showing AUD in the Funding Currency column and once showing USD.
3. Both rows are amber "Not saved" preview rows, independently priced (the live Revenue/Margin/etc. numbers can differ between the two since FX math depends on funding vs. payout currency).

## B. Funding Currency column is no longer a dropdown
1. Look at the Funding Currency column on any row (saved or preview).
2. **Expected:** it's plain text (e.g. "AUD"), not a dropdown — there is no way to change a row's funding currency in place.

## C. Editing and saving one currency's row doesn't affect the other
1. Edit a field (e.g. Fixed Fee) on the AUD preview row for a corridor, and separately edit a different field on the USD preview row for the *same* corridor.
2. Click "Save Edited Corridors".
3. **Expected:** both become independent saved rows — 2 separate rows for the same corridor, one per currency, each with its own saved values. Neither disappears or merges into the other.

## D. Removing one currency's row doesn't remove the other
1. With both currency rows saved for a corridor (from test C), click "Remove" on the AUD row.
2. **Expected:** only the AUD row disappears. The USD row for the same corridor is untouched.
3. **Expected also:** since the corridor still matches the active filters, the AUD row reappears as a new amber preview row (it's not permanently gone — you just removed the saved one).

## E. Dismissing one currency's preview doesn't dismiss the other
1. With both AUD and USD preview rows showing for a corridor, click "Dismiss" on the AUD preview row.
2. **Expected:** only the AUD preview disappears for this session. The USD preview for the same corridor stays visible.

## F. A quote with no funding currencies selected still works
1. On a quote with zero funding currencies selected, open the Pricing tab.
2. **Expected:** matching corridors still show exactly one preview row each (funding currency column shows "—"), same as before this change — no regression for the "no funding currency" case.

## G. Backend still enforces the rule directly (belt-and-suspenders)
1. Using Postman, try to add the same corridor twice with the same `fundingCurrencyId` (or twice with none) — confirm 409, per the backend test plan already covered in the previous step.
