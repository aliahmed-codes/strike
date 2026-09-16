# Test plan: Bulk Edit on the Pricing tab

Prerequisites: a quote with at least 4-5 corridor rows on the Pricing tab (a mix of saved and unsaved preview rows, at least one row using a tiered pricing model, ideally rows from different corridors so their catalog "standard" reference fees differ).

## A. Selection
1. Tick the header "select all" checkbox. **Expected:** every currently visible row gets checked; if a table filter is active, only the filtered/visible rows are selected, not hidden ones.
2. Untick one row individually. **Expected:** the header checkbox becomes unchecked (not indeterminate — just unchecked, matching the old app's real behavior).
3. Tick it back, then apply a table filter that hides some selected rows. **Expected:** selection state for the now-hidden rows is preserved (just not visible) — re-clearing the filter should show them still checked.

## B. Bulk Edit entry point
1. With 0 rows selected, confirm no "Bulk Edit" button is visible at all (not just disabled).
2. Select 2+ rows. **Expected:** a "Bulk Edit (N)" button appears next to "Filter Corridors", with N matching the selected count exactly.
3. Confirm selecting/deselecting rows does NOT disable the "Filter Corridors" button (a deliberate deviation from the old app's friction).

## C. Modal and field behavior
1. Click "Bulk Edit (N)". **Expected:** a modal titled "Bulk Edit N Corridors" opens with a "Field to Edit" dropdown and no value input yet.
2. Pick "Fee Discount %". **Expected:** a value input appears with a "%" suffix; typing a negative number is allowed (e.g. -5, meaning a markup).
3. Pick "Fixed Fee (USD)" instead. **Expected:** the value input has no "%" suffix, and typing a negative number is blocked.
4. The "Apply" button should be disabled until a field is chosen AND a valid number is typed.

## D. Reciprocal recompute — the important correctness check
1. Select 2 rows that are for *different* corridors (so their catalog standard fees differ).
2. Bulk-edit "Fee Discount %" to 20%.
3. **Expected:** each row's Fixed Fee updates to reflect *that row's own* standard fixed fee × (1 − 20%) — not the same number copied to both rows. If a corridor has no standard fixed fee but does have a standard variable fee, Variable Fee % should update instead.
4. Now bulk-edit "Yearly Volume (USD)" to a new value on a couple of rows. **Expected:** each row's Yearly Transactions recomputes as `new volume ÷ that row's own ATV`, rounded.
5. Bulk-edit "Applied FX Spread %" — confirm it's set directly with no other field changing.

## E. Staging behavior (no premature save)
1. After applying a bulk edit, confirm every affected row shows the same "Unsaved changes"/"Not saved" indicator a manual single-field edit would show — bulk edit should look identical to hand-editing each row individually.
2. Confirm nothing was sent to the server yet (no network request, no change to already-saved values if you reload without saving).
3. Click "Save Edited Corridors" — confirm every bulk-edited row (saved and promoted-from-preview alike) persists correctly with the bulk-applied values.

## F. Selection persistence and cancel
1. After clicking Apply, confirm the row selection is still checked (not cleared) — matching the old app.
2. Open Bulk Edit again, pick a field, type a value, then click Cancel. **Expected:** the modal closes with no changes applied to any row.

## G. Tiered corridors
1. Include a tiered-pricing row in your selection and bulk-edit any of the 7 fields. **Expected:** it applies to that corridor's own base/standard fields (the ones used for its "standard remainder" volume) exactly like any other row — no separate tiered field list, and no broken/no-op behavior like the old app has for its (non-functional) tiered bulk-edit fields.

## H. Fee (Selected Currency) — inline column
Prerequisite: on the Summary tab, set "Default Fee Currency" (Technical Pricing Details) to a currency with a real rate — e.g. AUD or EUR — then save the draft.
1. Open the Pricing tab. **Expected:** a new "Fee ({currency code})" column appears right after "Fixed Fee", showing each row's fixed fee converted into that currency.
2. Type a new value directly into that column for one row. **Expected:** the row's "Fixed Fee" (USD) column updates to match (reverse-converted), and the row shows as unsaved/dirty exactly like any other manual edit.
3. Change the Default Fee Currency to one with no real rate (anything outside the ~14 covered currencies), save the draft, and reopen Pricing. **Expected:** the column shows "No rate available" instead of an input — you cannot type into it, and nothing silently assumes a 1:1 rate.

## I. Fee (Selected Currency) — Bulk Edit
1. Select 2+ rows (with a valid Default Fee Currency set), open Bulk Edit, choose "Fixed Fee (Selected Currency)". **Expected:** the value input shows the currency code as a suffix (not "%"), and a warning appears instead if no rate is available for the current Default Fee Currency (Apply should be disabled in that case).
2. Apply a value. **Expected:** every selected row's Fixed Fee (USD) updates to the same converted amount, and each row's Fee Discount % recomputes from *that row's own* standard fee, same as a regular Fixed Fee (USD) bulk edit.

## J. FX Spread presets
1. Select 2+ rows for *different* corridors (ideally with different funding currencies, and at least one being a "like-for-like" corridor where funding currency equals payout currency). Open Bulk Edit, choose "Applied FX Spread %". **Expected:** 4 radio options appear — Custom Value, Use Default Spread, Use Minimum Spread, Apply FX Markup — matching the old app's layout.
2. Leave "Custom Value" selected, type a number, Apply. **Expected:** every selected row gets that exact same value (unchanged behavior from before).
3. Select "Use Minimum Spread for each corridor", Apply. **Expected:** each row gets a *different* value reflecting that row's own corridor: a like-for-like row should get 0%; others should get their own treasury FX cost plus 0.10% (if funding currency is GBP/USD/EUR/SGD/AUD/CAD) or 0.20% (any other funding currency).
4. Select "Use Default Spread for each corridor", Apply. **Expected:** same per-row logic as Minimum Spread, but each non-like-for-like row's value is exactly 0.10 percentage points higher.
5. Select "Apply FX Markup", type a Markup % (e.g. 0.5), Apply. **Expected:** each row's new spread = that row's own treasury FX cost + the markup you typed (not the minimum-spread currency-tier markup).

## K. MBP placeholder
1. Open Bulk Edit, choose "Apply Market-Based Pricing (MBP)". **Expected:** the same descriptive blue info box as the old app appears, plus a note that it's not yet available.
2. Confirm "Apply" stays disabled the whole time this field is selected — there's no way to accidentally apply a fake/zeroed MBP adjustment.
