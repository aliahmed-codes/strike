# Test plan: Pricing tab's own column filters + sorting

Prerequisites: a quote with at least 3-4 corridor rows (a mix of saved and unsaved preview rows is ideal), some needing approval and some not, ideally with 2 different funding currencies and at least one corridor whose payer is a "SWIFT Wire Transfer" one.

## A. Sorting
1. Click the "Corridor" column header. **Expected:** rows sort alphabetically ascending, an ▲ appears next to the label.
2. Click it again. **Expected:** now descending (▼).
3. Click it a third time. **Expected:** returns to the original (unsorted) order, no arrow shown.
4. Repeat for "Yearly Volume", "Revenue", "Margin %", "Take Rate", "Approval", and "Funding Currency" — each should sort numerically/alphabetically as appropriate.
5. Clicking a different column's header while one is already active should switch sorting to the new column (ascending first), not combine them.

## B. Opening the "Filter Corridors" modal
1. Click the "Filter Corridors" button above the table. **Expected:** a modal opens matching the old app's real layout — Region/Country/Transaction Type/Service/Payout Currency/FX Source/Funding Currency as checklists, Financial/Network Approval as Yes/No checklists, the SWIFT show/hide pair, the volume zero/non-zero pair, and the 6-checkbox "Show Corridors with Negative Values" group.
2. Confirm every checklist's options match what's actually present among the currently displayed corridors (not the full catalog) — e.g. if all your corridors are in Europe, "Region" should only list Europe, not every region.

## C. Checklist filters (Region, Country, Transaction Type, Service, Payout Currency, FX Source, Funding Currency)
1. Check a Region value. **Expected:** the table (behind the modal) instantly narrows to matching rows; the modal stays open so you can keep composing filters.
2. Check a second value in the same group (e.g. two countries). **Expected:** rows matching *either* value show (OR within a dimension).
3. Additionally check a value in a different group (e.g. also filter by Transaction Type). **Expected:** now only rows matching both the Region selection *and* the Transaction Type selection show (AND across dimensions).
4. Uncheck everything in one group. **Expected:** that dimension's filter clears, other active filters remain.

## D. Approval filters
1. Check "Yes" under Financial Approval. **Expected:** only rows currently flagged for financial approval remain.
2. Check "No" instead. **Expected:** only rows NOT flagged remain.
3. Repeat for Network Approval independently — the two should combine with AND if both are set.

## E. SWIFT and volume toggles
1. Check "Show only corridors with USD SWIFT Wire Transfer". **Expected:** only rows whose payer is a SWIFT Wire Transfer payer remain.
2. Uncheck it, check "Hide only corridors with USD SWIFT Wire Transfer" instead. **Expected:** the opposite set shows.
3. Check "Show only corridors with 0 Yearly Principal Volume" — only rows with exactly 0 volume remain. Switch to the >0 variant — only rows with positive volume remain.

## F. Negative-value checks
1. Check "Margin %" under "Show Corridors with Negative Values". **Expected:** only rows with a negative Margin % show.
2. Additionally check "FX Margin %". **Expected:** rows with EITHER a negative Margin % OR a negative FX Margin % now show (OR within this group, since each checkbox is "another reason to flag this row," not an additional requirement).

## G. Clearing and totals
1. With several filters active, click "Clear Filters" (in the modal or next to the "Filter Corridors" button). **Expected:** every filter resets, all rows reappear.
2. With a filter active that narrows the table, check the Summary totals bar above — it should reflect only the currently-visible (filtered) rows, not the original full total. Clearing filters should restore the original totals.
3. The "Filter Corridors" button should show a small count badge (e.g. "3/7") whenever any filter is active, and disappear when cleared.

## H. No regressions
1. Confirm editing a row's fields, saving, removing, and the funding-currency fan-out (Phase B) all still work exactly as before.
2. Confirm a saved row that doesn't match the *Corridors to Offer* filter still appears in this table (a separate, older rule, unaffected by this new column filter).
