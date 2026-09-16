# Old App Reference: Pricing Tab Corridor Editing, Saving, and Related Features

**Purpose of this document:** a durable, detailed record of how the OLD app (`D:\buy-frame\STRIKE`) implements the Pricing tab's explicit-save workflow, multi-funding-currency rows, totals, filters/sorting, bulk actions, and Excel export — captured before starting the rebuild of these features in `new strike`, so the context survives across sessions. This is research only; nothing here has been implemented yet in the new app.

All file paths below are under `D:\buy-frame\STRIKE\` unless stated otherwise.

---

## 1. Explicit "Save Edited Corridors" mechanism

### The button and its handler
- `client/src/features/quotes/components/SaveCorridorsButton.tsx` (443 lines) — the whole file is this one component. Label: `Save Edited Corridors (${lengthForLabel}/${totalCorridors})`. `handleSave` (line 37) is a large ad-hoc async function, not a shared hook.
- `handleSave` flow:
  1. Reads saved corridors from `useCorridorResultsStore.getState().getAllSavedCorridors()` and unsaved edits from `useUIStateStore`'s `pricingTab.unsavedCorridorResults`.
  2. Builds a merged `corridorsToSave` array keyed by the dirty set `interactedCorridors`, layering staged edits over the base row (lines 91-120) — then **redundantly rebuilds** an almost-identical, more elaborate `corridorResults` array field-by-field for ~15 fields (lines 166-276). This double-merge is duplicated logic that should be a single function in the rewrite.
  3. **Before the network call**, optimistically writes the merged rows into `useCorridorResultsStore` via `upsertCorridorResults(savedLike)` (line 313) and clears `unsavedCorridorResults` down to `{ deletedCorridors: [] }` (lines 316-325) — synchronously, before `saveQuoteDraft` is even awaited.
  4. Calls `await saveQuoteDraft(user.id, corridorResultsFiltered)` (line 340), which hops into `quotes.current.store.ts`.
  5. On success: sets `lastSaved`, writes `localStorage['pricing-last-save-time']` (no error handling around this write), clears `interactedCorridors`.
- `saveQuoteDraft` (`client/src/features/quotes/stores/quotes.current.store.ts`, starts ~line 1097): builds several unrelated snapshots (quoting details, technical details, filters, setup fee, pricing tool, P&L projections), creates/updates the Quote record, sets `isDirty: false`, then — only if corridors were passed — calls `quotesCorridorsApi.bulkSave(quoteId, corridors)` at **line 1464**, followed by `recalculateAggregates` and a quote refetch (lines 1466-1483, wrapped in `try/catch {/* noop */}`), then recomputes approvals via `useQuotesApprovalsStore.getState().computeFromCorridors(...)` (line 1499, also silently swallowed on error).

### Dirty/pending-edit buffering — two-tier design
- **`useCorridorResultsStore`** (`client/src/features/quotes/store/useCorridorResultsStore.ts`) holds only the "saved" bucket:
  - `saved: Record<string, SavedCorridorResult>` keyed by a composite string key (see §2) — the source of truth for what's considered persisted, including an `isFromDatabase` boolean per row.
  - `enrichedDeets` (raw corridor detail JSON, same keys) and `readyToClone` (ephemeral clone data) are separate top-level maps.
  - Persisted to **IndexedDB** (not localStorage) via a custom `createIndexedDBStorage` adapter; only `saved` is persisted (not `enrichedDeets`/`readyToClone`).
  - Despite the name, this store does **not** hold unsaved/dirty patches — that's a different store.
- **`useUIStateStore`'s `pricingTab` slice** holds the actual dirty state:
  - `interactedCorridors: Set<string>` — the dirty set of corridor keys the user has touched this session.
  - `unsavedCorridorResults: Record<string, any>` — keyed by the same composite key, each value a partial patch of only the changed fields (fixed fee, variable fee, fx spread, revenue share, etc).
  - `unsavedCorridorResults.deletedCorridors` is a special key inside this same record holding an array of deleted-corridor identifiers (see §5) — accessed defensively with a fallback for when it was once stored as an object instead of an array (a sign of a prior bug).
  - Actions: `updatePricingInteractedCorridors(Set)`, `setPricingTabState(partial)` (generic merge into `pricingTab`).

**Design takeaway for the rebuild:** a clean two-tier model — "saved" bucket + "dirty set + patch map" — is the right shape, but should live in one clearly-owned place rather than split across two independently-persisted stores that must be kept in sync by hand.

### Live client-side recalculation
- Recalculation is entirely client-side and instant — no server round trip needed to see updated numbers as you type.
- `PricingTab.tsx`'s `computeAll(base, plDiscounts, dashboardFundingCurrency?)` (line 5838) recomputes FX source, like-for-like detection, FX spread, revenue-share math, purely from in-memory state.
- Pure math lives in `client/src/features/quotes/lib/pricing-calculations.ts`: `computeFxMargin`, `computeFxMarginPercent`, `computeTreasuryFXCost`, `calculateMarginFee`, `computeFxSpread`, `computeFxSource`, `computeStandardCorridor`, `computeTieredPricing`, `computeFxDefaultSpread`, `computeFxMinimumSpread`, etc.
- `computeCorridorNumericValues(corridor, stagedPatch)` folds a row's base values with its staged patch to produce the numbers rendered live in the grid, before any Save click.
- Net: editing a cell updates `unsavedCorridorResults[key]` synchronously, the row re-renders using the staged patch, and nothing hits the network until Save is clicked. **This is the behavior to replicate**, and our current rebuild already does live client-side math for the preview-row mechanism — the missing piece is buffering edits to *existing saved rows* the same way, instead of saving on blur.

### Tab-switch persistence
- `client/src/features/quotes/utils/quoteTabSnapshot.ts` (85 lines) captures five module-singleton Zustand stores' data (function refs stripped): `appStore`, `uiStateStore`, `corridorResultsStore`, `peggedRatesStore`, `setupFeeStore`.
- `captureData()` deep-clones via `structuredClone` (preserves `Set`s like `interactedCorridors`; a `JSON.parse(JSON.stringify(...))` fallback would lose them — noted as a real risk in the old code's own comment).
- `captureQuoteTabSnapshot()` runs before switching away from a quote tab; `restoreQuoteTabSnapshot(snap)` calls `.setState(snap.X)` on each store (shallow-merge, so action functions survive) when switching back.
- Because `uiStateStore` is snapshotted wholesale, `pricingTab.unsavedCorridorResults` and `interactedCorridors` are preserved across Summary ↔ Pricing tab switches, and because `corridorResultsStore` is also snapshotted, the "saved" baseline stays consistent alongside it.
- `useQuotesApprovalsStore` is explicitly excluded because it's already keyed by `quoteId` internally.

### Unsaved vs. saved row UI
- Row background logic (`PricingTab.tsx` ~line 5093):
  ```
  needsApproval → bg-red-50
  !interactedCorridors.has(key) → bg-yellow-50   // "pristine" / untouched
  else → bg-white                                 // touched but no approval issue
  ```
- **Anti-pattern — do not copy:** yellow marks *untouched* rows and white marks *edited* rows — the reverse of the intuitive convention (yellow = "changed, needs saving"). The rebuild should use the intuitive mapping (e.g. amber/yellow = unsaved change, plain = saved/clean, red = needs approval).
- A separate amber badge system (`bg-amber-100`/`bg-amber-400`) shows "needs approval" specifically, gated on `interactedCorridors.has(key) || corridor.isFromDatabase`.
- `isFromDatabase` is a distinct flag from `interactedCorridors` membership; several call sites consult both together rather than a single unified "dirty" concept.

### Save-failure handling — real bug, do not copy
- `quotesCorridorsApi.bulkSave` has no try/catch of its own — errors propagate to the caller.
- `saveQuoteDraft`'s call to `bulkSave` (line 1464) is a bare `await` with no surrounding try/catch — a failure there throws out of `saveQuoteDraft` entirely. Only the subsequent aggregate-refetch and approvals-recompute calls are wrapped in `try {} catch {/* noop */}`, so those fail silently with no user feedback.
- The only real error handling is in `SaveCorridorsButton.tsx`'s `handleSave` `catch` block (lines 348-366): inspects the error's status/code/message and shows a blocking `alert(...)`.
- **Critical bug:** the optimistic writes (`upsertCorridorResults`, clearing `unsavedCorridorResults`) happen *before* `saveQuoteDraft` is even called, and are never rolled back in the `catch` block. So if the save fails:
  - The "saved" store already reflects the edited values as if persisted.
  - The per-row dirty patch has already been wiped, so the row immediately displays as "not interacted" (pristine).
  - The user sees an alert, but a page refresh or tab-restore would show the server's actual (unsaved) state — the edit is effectively lost, while the UI briefly looked like it succeeded.
- **Rebuild requirement (explicitly requested by the user):** never clear/merge the optimistic state until the server call actually succeeds. On failure, pending edits must remain visible, editable, and clearly marked as unsaved, with a non-blocking, in-context error message (not `alert()`).

### Other anti-patterns from this section (do not copy)
- Duplicated double-merge logic in `SaveCorridorsButton.tsx` (see step 2 above).
- Commented-out dead code left in place with an explanatory comment instead of being removed.
- Debug `console.log`/`console.warn` statements left in production paths (including corridor-name-specific ad hoc debugging).
- Attribution comments in code (e.g. "changed by Jayanth") instead of relying on git history — avoid in the rebuild.
- Massive prop-drilling where a component receives props but immediately re-reads "fresher" data from stores instead, because the props had drifted stale.
- Pervasive `any` casts and 2-3 simultaneous casing variants for the same field (`stdfixedfeeusd` vs `stdFixedFeeUSD`, `fundingCurrency` vs `fundingcurrency`, etc.) — normalize to one canonical (camelCase) naming convention at the API boundary once, not at every read site.
- `localStorage.setItem('pricing-last-save-time', ...)` has no error handling despite quota-exceeded being one of the very failure modes the save-error handler elsewhere is designed to catch.

---

## 2. Multiple funding currencies per corridor

### Row identity / composite key
- `client/src/features/quotes/utils/corridorKeys.ts` (140 lines) builds a pipe-delimited string key, **not** `${corridorId}:${fundingCurrencyId}`:
  - "Enhanced" format (when receivingPartner + payoutCurrency + fundingCurrency are all resolvable): `region|country|transactionType|service|receivingPartner|payer|payoutCurrency|fundingCurrency` (funding-currency segment appended only if truthy).
  - "Legacy" fallback (triggered with a `console.warn` in a hot path — do not copy): `region|country|transactionType|service|payer[|fundingCurrency]`.
  - `buildCorridorKeyFromObject(corridor)` wraps this, pulling fields off a corridor object with camelCase/lowercase fallbacks.
- **Anti-pattern:** whether funding currency ends up in the key at all is conditional on unrelated fields being present, making the key's shape non-deterministic across corridors in the same quote. The rebuild should use one deterministic composite key, always including funding currency when the feature is active — e.g. `${corridorId}:${fundingCurrencyId}`.

### Row expansion ("one row per funding currency")
- Happens in `PricingTab.tsx` (lines 943-1011) inside a `useEffect` that loads corridors:
  ```js
  const corridorRows = fundingCurrencies.flatMap(fundCurrency =>
    baseRows.map(corridor => { ...clone with fundCurrency... })
  )
  ```
  Every base corridor is cloned once per funding currency in the quote's `fundingCurrencies` array. Each clone gets `fundingCurrency` set, `fxSource` renormalized, `fxDefaultSpread` recomputed per-currency, and a **synthetic id** `${corridor.id}_${fundCurrency}` with the real DB id kept separately as `_originalId`.
- **Anti-pattern — do not copy:** this synthetic `id_currency` identity scheme is a *second*, inconsistent identity system alongside the pipe-delimited key from `corridorKeys.ts`; migration code exists specifically to reconcile old numeric-id-based dirty sets into the pipe-key format, itself evidence of past churn. The rebuild should pick one canonical composite key used everywhere (client state keys, API payload identity, DB matching) — no separate "row id" scheme.

### Pricing math differences per funding currency
- Funding currency doesn't drive a rate-table lookup; it drives rule-based branches in `pricing-calculations.ts`, comparing `fundingCurrency` to `payoutCurrency`:
  - `computeFxSpread`: 0.01 for Cost Plus; 0.01 if payout=USD & funding≠USD; `'Like to Like'` if payout===funding; else 0.
  - `computeFxSource`: `'Reuters Bid Rates'` if payout=USD & funding≠USD; `'Like for Like'` if payout===funding; hardcoded `'XE Hourly Rate'` if funding=EUR and payout∈{XAF,XOF}.
  - `computeFxDefaultSpread`: like-for-like short-circuits; otherwise a rules cascade involving `computeFxMinimumSpread` plus markup, with grid/treasury special cases.
  - `computeFxMargin`: 5 explicit rules, several keyed on `fundingCurrency === payoutCurrency`, plus hardcoded EUR→XAF and EUR→XOF special cases forcing FX margin to 0.
- A separate `CurrencyRateCache` singleton (`services/currencyRateCache.ts`, 1-hour TTL, hydrated from `GET /app-config/currency-rates`) converts *fee* amounts into a user-selected **fee-display currency** (a different field from `fundingCurrency`) — don't conflate the two.
- **Anti-pattern — do not copy:** hardcoded currency-pair special cases (EUR/XAF, EUR/XOF) duplicated across at least 3 functions instead of a single data-driven exception table.

### Database schema — the real gap
- **`priceframe_schema.sql`** (`public.quote_corridors`, the schema actually wired to the live server) has a `funding_currency varchar(10) DEFAULT 'USD'` column but **no unique constraint** involving `(quote_id, corridor_id, funding_currency)` — only a PK on `id` and a few FKs. No index on `funding_currency` either.
- **`priceframe-gm2.sql`** (`v2.quote_corridors`, a separate/orphaned schema dump) *does* model this properly: `funding_currency_id` as a proper FK to `v2.currencies(id)`, plus `UNIQUE (quote_id, corridor_id, funding_currency_id, tier_number)` and a companion `v2.quote_funding_currencies` join table. This `v2` design is **not referenced anywhere in server code or migrations** — it's an unused prototype, never wired up.
- Server-side matching (`server/app/features/quotes/services/quote_corridors_service.ts`, `bulkCreate()`) does an **in-memory** `.find()` over existing corridors matching on `region/country/transactionType/service/payer/receivingPartner/payoutCurrency`, and *conditionally* also `fundingCurrency` — but `fundingCurrency` is explicitly excluded from "required fields" validation ("for backwards compatibility"), so if it's falsy in a payload, matching silently falls back to the base fields only, which could clobber a currency-specific row with data meant for a different currency. This is pure application-code matching with **zero DB-level enforcement**, and it's an O(n×m) linear scan.
- **Rebuild requirement:** add a real DB unique constraint on `(quote_id, corridor_id, funding_currency_id)` from day one (analogous to the orphaned `v2` design, but actually wired up), and never make `fundingCurrency` an optional/skippable part of the match key.

---

## 3. Summary totals on the Pricing tab

- Component: `client/src/features/quotes/pricingTabs/helper-components/SummaryComponent.tsx` (53 lines), rendered from `PricingTab.tsx`.
- Aggregation is 100% client-side via inline `.reduce()` over `visibleCorridors`: Total Volume, Total Transactions, Total Revenue, and a derived Average Take Rate (`totalRev / totalVol * 100`).
- **Rows included: ALL currently displayed rows — saved AND unsaved/live-edited — not just database-persisted ones.** It excludes only rows that are soft/UI-deleted or filtered out by active corridor filters. The totals box does *not* read the server-persisted `currentQuote.totalYearlyRevenue` etc.
- A separate, disconnected server-side aggregate path exists: `QuotesService.recalcAggregates` (`server/app/features/quotes/services/quotes_service.ts`) sums totals over DB-persisted corridors and writes them onto the Quote row, called only right after a `bulkSave` to refresh `currentQuote` — but the Pricing tab's own totals box never reads those fields. Two parallel, unreconciled aggregate computations exist with no indication they're meant to agree.
- **Anti-patterns — do not copy:** `corridors: any[]` prop typing with lowercase alias field names bypassing the shared type entirely; redundant multiple `.reduce()` passes over the same array on every render instead of one `useMemo`.
- **Rebuild takeaway:** decide explicitly whether Pricing-tab totals should include unsaved/preview rows (likely yes, to match "what you see"), compute it with one memoized pass using the shared `Quote`/`CorridorPricingRow` type, and if a server-persisted aggregate is also needed (e.g. for the Summary tab), keep it clearly separate and documented as a different number.

---

## 4. Pricing tab's own table filters/sorting

(Distinct from the Summary tab's "Corridors to Offer" filter and from `useUIStateStore` — this is a third, separate filter/sort system, local to the Pricing tab.)

- **Sort**: plain component `useState<CorridorSortState>` in `PricingTab.tsx` (not a store, not URL state). Logic lives in `pricingTabs/helper/sortCorridors.ts`. Sortable fields are hardcoded to **only `country` and `region`** — nothing else, despite the filter system supporting much richer numeric-field logic. `cycleSortState` cycles asc → desc → null.
- **Filter**: also plain component `useState<CorridorFilters>`, type defined in `pricingTabs/helper/corridorFilters.ts`. Supports: country, region, transactionType, service, payoutCurrency, fxSource, fundingCurrency, financialApproval, networkApproval flags, hideZeroVolume/showNonZeroVolume, six separate "negative value" booleans (negativeMarginFee, negativeMarginFeePercent, negativeFxMargin, negativeFxMarginPercent, negativeMarginPercent, negativeGrossMarginPercent), SWIFT-only/hide-SWIFT toggles, and per-numeric-column "select specific displayed values" checkbox filters.
- Filtering is applied via **two near-duplicate code blocks** in `PricingTab.tsx` (~lines 667-721 and ~734-785), each replaying nearly the same set of checks for two different derived arrays — a maintenance hazard.
- **Anti-patterns — do not copy:**
  1. Sort is far less capable than filter for no clear reason (half-finished feature).
  2. Duplicated filter-application logic in two places.
  3. Six rigid "negative value" booleans instead of a generalized "field + comparison operator" filter model — every new numeric field needing this requires another boolean and another duplicated `if`.
  4. Filter/sort state as raw component `useState` inside an already enormous file (thousands of lines) rather than extracted into a hook/store.
- **Rebuild takeaway:** support sorting on every column that's meaningfully sortable (not just country/region), build one generalized numeric filter model (field + operator + value, or field + "negative only" as one case of a comparison), and keep filter/sort state in a dedicated hook so `PricingTab` doesn't keep growing.

---

## 5. Bulk edit / delete / restore

### Row selection
- Header "select all" and per-row checkboxes are real (`PrignigTableHeader.tsx` lines 65-72, `PricingTableRow.tsx` lines 291-293). Selection state (`selectedCorridors: Set`) lives in `useUIStateStore`'s `pricingTab` slice via `updatePricingSelectedCorridors`, toggled through `handleCorridorSelect` in `PricingTab.tsx`.

### Bulk edit — a genuine, working feature
- UI: `pricingTabs/helper-components/BulkEditModal.tsx` — a field dropdown, a value input, with special-cased UI for FX-spread modes (custom/default/minimum/markup) and a read-only blurb for Market-Based-Pricing (MBP).
- Apply logic: `applyBulkEdit` in `PricingTab.tsx` — validates the field/value, updates all selected corridors' in-memory state with field-specific math (e.g. `feediscountpercentage` recomputes `stdfixedfeeusd = standardFixedFeeUSD * (1 - value/100)`; a special MBP case inverts fee/FX adjustment percentages), recomputes financials, stages the results as unsaved patches, and marks the edited corridors as dirty/interacted.
- **Bulk edit only touches client-side state** — it never calls the API directly. Persistence happens later through the normal Save flow. This is consistent with the desired buffered-edit design, not a gap.

### Delete — confirmed soft delete, but via a fragile, JSON-array mechanism that is *separate* from a second, unrelated delete system
- Pricing tab's actual delete flow (`handleDeleteSelected`/`confirmDeleteSelected` in `PricingTab.tsx`): appends `{country, corridorId: buildCorridorKeyFromObject(corridor)}` entries to `unsavedCorridorResults.deletedCorridors`, explicitly does **not** remove the row from the in-memory `corridors` array, then calls the generic `saveQuoteDraft(userId)` to persist.
- `deletedCorridors` is a **JSONB column on the `quotes` table** (not a flag on `quote_corridors`), declared via migration `add_deleted_corridors_to_quotes.ts` and the `Quote` model. A corridor's `quote_corridors` DB row is never touched or flagged — "deletion" means every read path (table, filters, approval/financial aggregation) must separately check `isCorridorDeleted(corridor)` against this JSON list and skip matching rows. If any code path forgets that check, a "deleted" row would silently still count.
- **A second, entirely separate, real DB-level delete/soft-delete system also exists** (`quote_corridors_controller.ts`: a hard `delete()` via `DELETE /quote-corridors/:id`, and a `softDeleteCorridors()`/`restoreCorridors()` pair that set a `corridorState` enum — `active`/`hidden`/`deleted`/`restored` — directly on the `quote_corridors` row) — but this system is used **only** by an unrelated funding-currency-conflict-resolution flow (`TechnicalDetails.tsx`, `ConflictIndicator.tsx`), never by the Pricing tab's own delete/restore UI.
- **Anti-pattern — do not copy:** two non-overlapping "delete a corridor" concepts sharing similar vocabulary is a real trap for future maintainers. **Rebuild requirement:** pick one soft-delete representation (a `corridorState`-style column/flag on the corridor row itself is more robust than an external JSON id-list on the parent quote) and use it consistently for both "user removed this from the quote" and any future conflict-resolution scenario.
- Both delete-confirm and restore-confirm wrap their `saveQuoteDraft` call in `try {} catch {/* best-effort, noop */}` — a failed persistence gives the user zero feedback that their delete/restore didn't actually save. Do not copy; surface persistence failures for these actions too.

### Restore — real, but scoped to a modal, not a single "restore all" button
- A modal (`PricingTab.tsx` ~lines 5683-5828) lists currently-deleted corridors (`deletedCorridorsForRestore`) with per-row checkboxes and its own "select all" — so "restore all" is achievable by checking that box, but there's no dedicated one-click "Restore All" action.
- Restore commit: filters the selected ids out of `unsavedCorridorResults.deletedCorridors`, **also directly mutates `currentQuote.deletedCorridors` on the other store** (a manual dual-write because both places are read by different downstream code, lines ~5793-5809), then calls `saveQuoteDraft(userId)`.
- The "restore-all" comment mentioned in `quotes.current.store.ts` (line 1430) is about correctly handling the edge case where the resulting `deletedCorridors` payload is empty (everything got restored) — not evidence of a separate restore-all endpoint.
- **Anti-pattern — do not copy:** the dual-write between two stores on every restore is fragile — a future edit that updates one store and forgets the other will desync them. **Rebuild takeaway:** one single source of truth for "which corridors are soft-deleted on this quote," read/written from exactly one place.

---

## 6. Excel export ("Download Corridors")

- Trigger: `client/src/features/quotes/components/DownloadCorridorsButton.tsx` (235 lines), rendered only on the Pricing tab.
- **Entirely client-side**, using the `xlsx` (SheetJS community edition) package directly in the browser — `XLSX.utils.aoa_to_sheet` → `book_new` → `book_append_sheet` → `XLSX.writeFile(wb, fileName)` triggers the download with no server call at all. Filename: `Corridors_${partnerName}_${date}.xlsx`.
- **Data source — live-first, saved-fallback:** `corridorsToExport = (liveCorridors?.length > 0) ? liveCorridors : savedCorridors`, where `liveCorridors` is the same `displayedCorridors` the visible table renders (including unsaved edits and active filters) and `savedCorridors` comes from the client-persisted (IndexedDB-backed) `useCorridorResultsStore` — never a fresh server re-fetch, so a "saved" export can be stale.
- **Columns exported do NOT match the on-screen table.** Headers are three hand-typed literal string arrays (base + optional cost columns gated by a permission flag + ~34 "remaining" columns) that must be manually kept in sync with the real column source of truth (`pricingTabs/Constants.ts`'s `TP_COLUMN_GROUPS`, ~85 columns across 23 groups) — and already aren't: the export is missing all Tier 1/2/3 breakdown columns, rollups, and payment-info fields that the live table has.
- Formatting: per-cell SheetJS number formats (`#,##0.0000` for spreads, `0.00%` for most percentages, `#,##0` for volumes/revenue) but with an inconsistency — Fee Discount % and Gross Margin % use `0%` (no decimals) while everything else uses `0.00%`. A free-text title string is pushed as row 1 with a blank row 2 before the real header row (row 3), rather than a proper sheet title — breaks the usual "header row 1" assumption for anyone parsing the file programmatically. No cell styling, fonts, fills, frozen panes, or column widths.
- **Anti-patterns — do not copy:**
  1. Export column list duplicated and drifted from the single source of truth used by the on-screen table.
  2. A confusing error message ("Please save corridors first") when the code actually already prefers unsaved live data over saved data.
  3. Silent live→saved fallback that can bypass the user's active filters without telling them.
  4. No server refetch — risk of exporting stale client-cached data.
  5. Inconsistent percent-decimal formatting across similar fields.
  6. Broken "header row 1" assumption from the prepended title/blank rows.
  7. Long `||` fallback chains reading multiple casing variants of the same field name — symptomatic of the broader casing-inconsistency problem noted in §1 and §2.
  8. Three different, uncoordinated Excel-generation approaches coexist across the codebase for different export buttons (`xlsx` client-side, `xlsx-js-style` client-side for one specific export, and server-side `exceljs` for others) with no shared abstraction.
- **Rebuild takeaway:** derive export columns from the exact same column-definition source as the on-screen table (no separate hand-typed header list), decide explicitly and document whether export respects active filters or always exports everything, and pick one Excel-generation approach (likely server-side, for consistency and testability) rather than duplicating client-side logic per feature.

---

## Cross-cutting themes across all six areas (do not copy into the rebuild)

1. **Casing inconsistency**: the same logical field tracked under 2-3 different casings/aliases (`fundingCurrency`/`fundingcurrency`, `stdfixedfeeusd`/`stdFixedFeeUSD`, etc.) throughout stores, API transform layers, and UI, forcing long defensive `??`/`||` fallback chains everywhere. **Fix once**: normalize to one canonical (camelCase) shape at the API boundary, and never again downstream.
2. **Duplicate/parallel mechanisms for the same concept**: two identity schemes for a corridor+currency row (pipe key vs `id_currency`), two delete/soft-delete systems, two disconnected totals computations (client SummaryComponent vs server `recalcAggregates`), two near-identical filter-application code blocks, three Excel-export approaches. Each rebuild feature should have exactly one implementation, not accreted alternatives.
3. **Optimistic-write-without-rollback**: state that's mutated as if an operation succeeded, before the network call confirms it, with no rollback path on failure — the specific data-loss bug in the save flow (§1) is the clearest example, but the same "best-effort, error-swallowed" pattern also shows up in delete/restore (§5).
4. **Attribution comments and debug statements left in shipped code** — replace with clean code and rely on git history.
5. **No DB-level constraints backing app-level invariants** — the funding-currency uniqueness gap (§2) is the sharpest example: the correct constraint was designed (`v2.quote_corridors`) but never wired into the actual running schema.

This document should be treated as the reference for planning and implementing: (1) explicit corridor saving with buffered edits, (2) multi-funding-currency rows, and (3) the remaining Pricing-tab features (totals, filters/sorting, bulk actions, Excel export) — in that order, per the user's stated priority.
