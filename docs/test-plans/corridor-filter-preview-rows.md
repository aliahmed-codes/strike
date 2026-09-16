# Test Plan: Filter-Derived Live Preview Corridors (FEATURES.md item 5.5)

Covers the "Corridors to Offer" filter panel and the Pricing tab's live preview rows — the mechanism that replaces the earlier (deleted, never shipped) "Bulk Add by Filter" attempt. Do this in the browser at `http://localhost:5173`, signed in with your local test account.

## A. Cross-tab live filtering (the core ask)

| # | Step | Expected result |
|---|------|------------------|
| A1 | Open a quote, go to the Summary tab, scroll to "Corridors to Offer", tick a Region | Header count ("N of M corridors match") updates immediately |
| A2 | Switch to the Pricing tab, without saving anything | The same filter is already applied — matching corridors appear as amber-tinted rows in "Priced Corridors", each marked "Not saved", with real computed numbers (Std Fee/margin/take-rate/etc.), not zeros |
| A3 | Go back to Summary, change the filter (tick a Country too) | The "N corridors match your filters" note updates |
| A4 | Switch to Pricing again | The preview row list has narrowed to match — no page reload needed |
| A5 | Change a filter directly on the Pricing tab's own "Corridors to Offer" section instead | Same live effect, and switching back to Summary shows the same filter selection there too |

## B. Promoting a preview row by editing it

| # | Step | Expected result |
|---|------|------------------|
| B1 | Type a new Yearly Volume into a preview row, then click elsewhere (blur) | The row loses its amber tint and "Not saved" badge — it's now a real saved row, showing the value you typed |
| B2 | Reload the page | That corridor is still there with the value you entered (a real save, not a preview) |
| B3 | On a *different*, still-unpromoted preview row, change the Funding Currency dropdown | This also promotes it immediately (dropdown changes aren't blur-based, but should still trigger a save) |
| B4 | Change two fields on the same still-unsaved preview row in quick succession (fast typing across fields, tabbing through) | Exactly one real row is created, with both values present — no visible error, no duplicate row |

## C. No filters set

| # | Step | Expected result |
|---|------|------------------|
| C1 | Clear every filter on a quote with no filters ever set | The full matching catalog previews live on the Pricing tab (matches the old app — no "pick a filter first" gate) |
| C2 | If the catalog has more than 200 matches | A note reads "Previewing the first 200 of N matching corridors — narrow your filters to see the rest" |

## D. Anti-regression: a saved row must never disappear

The old app also appends saved corridors outside the Summary filters in its pricing merge. Retaining saved rows matches that behavior; the earlier claim that this was a deliberate departure was incorrect.

| # | Step | Expected result |
|---|------|------------------|
| D1 | Promote a corridor (per section B), then change the filters so it no longer matches | The saved row **stays visible** in "Priced Corridors" with its entered numbers — saved rows are never hidden by the current filters |
| D2 | Reload the page with those same non-matching filters | The saved row is still there |

## E. Remove / Dismiss

| # | Step | Expected result |
|---|------|------------------|
| E1 | Click "Dismiss" on an unsaved preview row | It disappears from the table immediately; nothing was ever saved (confirm via reload — no new row) |
| E2 | Click "Remove" on a real saved row that still matches the active filters | It's deleted, and does **not** immediately reappear as a preview row (it's added to a session-local dismissed set) |
| E3 | Change the filters and change them back | A dismissed corridor still does not reappear for the rest of this session; reloading the page resets the dismissed set (matches count may briefly increase again — this is expected, session-local behavior, not a bug) |

## F. Financial Summary excludes preview rows

| # | Step | Expected result |
|---|------|------------------|
| F1 | With several unsaved preview rows showing on Pricing, check the Summary tab's Financial Summary (Total Revenue, Corridors Priced, etc.) | Only real saved corridors are counted — preview rows contribute nothing until promoted |
| F2 | Promote one preview row, then re-check Financial Summary | The totals now include that corridor |

## G. Regression

| # | Step | Expected result |
|---|------|------------------|
| G1 | The one-at-a-time "Add a Corridor" form at the bottom of the Pricing tab | Still works exactly as before |
| G2 | Tiered pricing, inline edits, and the Details panel on already-saved rows | Still work exactly as before; preview rows show a disabled "Standard" pricing model (tiering requires a real row first) |
| G3 | `cd apps/server && node ace test` | All 105 tests pass AND the command exits 0. The latest full run did both. Earlier runs printed passing assertions but exited 1; that intermittent issue is not fixed by this change and must not be ignored if it recurs. |
| G4 | `npx turbo run build typecheck lint` from repo root | All workspace tasks exit 0. Verified; five existing client lint warnings and the existing bundle-size warning remain. |

## H. Multi-select count regression (2026-09-15)

This is the currently approved fix. Save-on-blur in section B is still the rebuild's current behavior, NOT parity with the old app's explicit Save Edited Corridors action. That separate change remains pending review.

| # | Step | Expected result |
|---|------|------------------|
| H1 | Refresh the page. In a quote, choose Europe; Czech Republic and Denmark; BankAccount and Card; B2C, C2C and B2B; EUR and USD. Clear the Payer selections. | With the currently imported catalog, 8 catalog corridors match; both countries are represented. No unrelated countries appear among new previews. |
| H2 | Review the screenshot's stored selections, including All Banks Austria/Belgium/Bulgaria USD (via SWIFT Wire Transfer). | These payers conflict with Czech Republic/Denmark, so 0 catalog corridors match. Selected incompatible payers stay available to deselect, with zero count; they do not broaden the query. |
| H3 | Switch from Summary to Pricing without editing any pricing cell. | Matching preview count agrees with the filters. Previously saved rows are counted separately and are not deleted. Filtering issues only reads, not corridor-create requests. |
| H4 | Rapidly change Country/Service selections. | Loading status appears while new matches load; previous-filter preview rows are not shown as current results. |
| H5 | Clear all facet selections. | The catalog is available again, subject to the existing use-case restriction, SWIFT option, and 200-row preview cap. |
| H6 | Check Network requests on both tabs. | Arrays use separate encoded entries such as countryIds%5B%5D=44&countryIds%5B%5D=47. Payer punctuation is encoded, not treated as separators. |

Verification record: live read-only API checks passed for H1 (8 matching rows) and H2 (0 matching rows); the legacy comma-separated country request also correctly returned 28 rows for Czech Republic + Denmark without the narrower filters. Automated endpoint tests cover all six dimensions and a payer containing commas/ampersands. The user subsequently confirmed the filter/count behavior works and matches their old-app example, then explicitly approved committing the current preview/count-fix baseline. No claim is made that every browser interaction in H3–H6 was individually observed by the assistant; API tests are not a substitute for those checks.

## Sign-off

- [ ] A–H all pass
- [ ] The anti-regression check (D) specifically confirmed — a saved corridor never vanishes when filters change
- [x] User personally confirmed the filtering/count fix works (2026-09-15)
- [x] User explicitly approved committing the current corridor-preview/count-fix baseline
- [ ] Complete explicit-save and funding-currency parity in a separately reviewed step
