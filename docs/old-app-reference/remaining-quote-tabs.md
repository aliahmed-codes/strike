# Remaining Quote Tabs: Old-App Evidence and Rebuild Roadmap

Research date: 2026-09-17. Status: source research complete; **Step 0 decisions (D1–D6) resolved with the user on 2026-09-17** — see section 7. Step 1 (P&L shared computation + backend) is the next step to be planned and approved separately. No feature implementation is authorized by this document.

## 1. Purpose, evidence, and how to use this document

This is the central reference for completing **P&L, Quoting Summary, Legal, and Approvals** in STRIKE. It records what the old application's actual routed code does, what the rebuild already provides, what must not be copied, and the sequence for building the remaining functionality in reviewable steps.

Read this with [CLAUDE.md](../../CLAUDE.md), [DEV.md](../../DEV.md), and [FEATURES.md](../../FEATURES.md). FEATURES remains the status tracker; this document owns the detailed research and proposed work sequence. The older [Pricing tab reference](pricing-tab-corridor-editing.md) covers the upstream corridor-editing feature, not these four tabs.

### Evidence boundaries

- **OLD** means `D:\buy-frame\STRIKE`. Paths prefixed `OLD/` below are relative to that directory.
- **NEW** means `D:\buy-frame\new strike`. Paths prefixed `NEW/` are relative to that directory.
- Source anchors use `path:line-range` and function names. Line numbers describe the working trees on the research date; re-check before implementing if either repo changes.
- Old HEAD: `fe5564231` (`summary tab implementation`). Its working tree already had staged command-file changes, a modified `server/start/routes.ts`, and an untracked temporary script. This review used the current working files and did not modify any old-app files.
- New HEAD: `aa9085c` (`feat(quotes): readable field validation errors on the Pricing tab`). Its working tree was clean before this documentation task.
- This was **static source research**: UI call sites, store functions, API helpers, registered routes, controllers, services, models, migrations, shared types/math, and project docs. No database restore, live production queries, external uploads, browser execution, or old-app test execution was performed.
- Consequently, “implemented” below means a reachable code path exists, not that a feature was runtime-tested or is frequently used in production. Migrations describe intended schema, not proof of the schema currently deployed. The `.sql` archives were not treated as plain-text schema evidence.

### Active implementation versus parallel code

The quote editor renders `PLTab`, `QuotingSummary`, `Legal`, and `QuoteApprovalsTab`: `OLD/client/src/features/quotes/components/QuoteEditor.tsx:1258-1299`. Its APIs point to controllers under `server/app/features`, as registered in `OLD/server/start/routes.ts`.

There is another implementation under `OLD/server/app/modules/quotation/`, including projections, approvals, and legal modules. Do not assume those files power these tabs. `OLD/server/adonisrc.ts:44` preloads `start/routes` and `start/kernel`; the inspected active routes target `#features/...`, not the parallel quotation modules. The findings below follow those real UI/API paths rather than inferring behavior from the existence of better-named alternate services.

### Important existing-doc discrepancies

1. An editor/filesystem mismatch was detected during verification: the IDE read of NEW `FEATURES.md` returned an older 210-line version, while `git show HEAD:FEATURES.md` returned the committed 305-line version and Git reported no tracked changes. The committed version explicitly records Phase C completion and the validation follow-up at lines 231-237, while its earlier backlog still contains older pending descriptions. Treat the latest committed completion notes and actual source as authoritative. Follow-up: the user explicitly chose to preserve the latest saved version and add the roadmap link. Accessing the file through its Windows extended-length path exposed the complete on-disk content; the link was inserted there and Git verified six added lines with no deletions. Reload any stale editor view from disk before further edits; do not overwrite the complete file with an older buffer.
2. Its Phase 3 text says Quoting Summary is a read view over Phases 1–3. That is a sensible **rebuild design**, but not a description of the old app, which separately recomputes summary projections and can disagree with P&L.
3. Phase 4 explicitly scopes v1 to **one simple approval record**, not the old app's multi-group workflow. Phase 5 explicitly excludes collaborative editing, comments, and Drive synchronization. Full parity with those larger old-app features needs a separate scope approval.
4. Old P&L is not simply “three-year growth plus all Setup Fee income.” Its actual monthly-fee and margin behavior is inconsistent; see section 3 before choosing formulas.

## 2. Current rebuild: what exists and what is missing

| Area | Verified current state | Remaining work |
|---|---|---|
| Four requested tabs | All four render `PlaceholderTab` in `NEW/apps/client/src/features/quotes/pages/QuoteEditorPage.tsx:115-125`. | Real data hooks, views, loading/error/empty states, and approved actions. |
| APIs | `NEW/apps/server/start/routes.ts:47-66` registers quote CRUD, corridor CRUD/bulk-delete/bulk-restore/deleted-list, and Setup Fee GET/PUT. | No P&L, Quoting Summary, approval transition, or document-generation routes are registered. |
| Corridor financial data | `NEW/packages/shared/src/types/quote.ts:121-145` exposes revenueFee, fxMargin, marginFee, totalRevenue, totalMargin, margin/gross-margin/take-rate percentages, split approval flags/reasons, currencies, and tier results. | Feed these canonical results into P&L once; never add tier results on top of the already-aggregated corridor result. |
| Quote totals | `NEW/packages/shared/src/lib/quote_totals_math.ts:1-47` implements shared `computeQuoteTotals`. It sums only rows with non-null totalRevenue for financial totals; counts use all supplied rows. | P&L additionally needs fee revenue, FX margin, fee margin, fee schedules, growth, year-level outputs, and agreed completeness rules. Existing totals alone are insufficient. |
| Setup Fee | `NEW/packages/shared/src/types/setup_fee.ts:58-94` and `lib/setup_fee_math.ts:18-105` provide normalized inputs and committed-revenue/TCV calculations, principal slots, block fees, waived months, and other fee types. | Decide how commitment minimums and contingent other fees enter projected revenue, without double counting transaction income. |
| Saved corridor membership | `NEW/apps/server/app/controllers/quotes_controller.ts:87-102` loads the model's active scope and computes saved totals. | Reuse that exclusion rule for P&L, summary, approval evaluation, and documents. Decide separately whether zero volume means inactive downstream. |
| Quote identity/commercial fields | `NEW/packages/shared/src/types/quote.ts:152-202` provides name, opportunity type, partner country, PR code, contract duration, fee/funding/source currencies, FX visibility flags, integration and ICP. | Old term-sheet legal/company/settlement/license fields are mostly absent; do not fabricate them from the quote name. |
| Permissions/state | `NEW/apps/server/app/services/quote_access_service.ts:4-7` permits admin or owner. Quote update/delete are draft-only; `quote_corridors_controller.ts:34-48` has a **file-local**, not exported, `loadEditableQuote`. | Approver access, assignment, state transitions, self-approval rules, and immutable decision history are not present. Extract/reuse access logic deliberately rather than importing a nonexistent shared loader. |
| Status vocabulary | NEW `QuoteStatus` is `draft / submitted / approved / rejected / closed` (`types/quote.ts:3`). | Old code uses `awaiting_approval`; explicitly map workflow semantics rather than adding a duplicate pending status. |
| Document dependencies | NEW client declares ExcelJS; NEW server does not declare ExcelJS, a PDF renderer, or a DOCX renderer (`apps/*/package.json`). | Server generation needs a reviewed dependency/runtime choice; root hoisting is not a substitute for declaring server dependencies. |

One more significant boundary: NEW `apps/server/app/validators/quote.ts:31` currently accepts contract lengths from 1 to 20 and does not explicitly require an integer. Old P&L displays three years; old document layouts commonly cover at most five. Do not label a three-year sum a 20-year contract total. Agree the horizon and fractional-year policy first.

## 3. P&L: exact old behavior and remaining implementation

### 3.1 Actual screen and editable inputs

Primary source: `OLD/client/src/features/quotes/components/PLTab.tsx`.

- The normal visible panel is **Projected P&L**, with two editable numeric inputs: **Year 2ov1 Growth** and **Year 3ov2 Growth** (`1366-1443`). They call `handleGrowthChange` (`275-284`), write `plTab.plData` in the UI store, and trigger live recalculation.
- `parseFloat(value) || 0` normalizes blank/invalid text to zero. The visible growth inputs have no min/max validation. A zero value renders as a blank input through `value={... || ''}`.
- A separate Setup/Network Joining Fee input and Other Monthly Fees input exist inside a `className="hidden"` block (`1374-1404`). Other Monthly Fees is disabled. These are **not available editable controls** in the current ordinary UI.
- The table has Year 1, Year 2, Year 3 columns, regardless of contract duration. Rows include principal, transactions, ATV, fee revenue, Setup Fee, Network Joining Fee, Monthly Fees, FX Margin, total revenue, margin fee, a repeated FX Margin row in the margin section, total margin, GM%, take rate, FX Margin%, and Margin% (`1436-1725`). Monetary quantities are generally rounded to integers for display; rates mostly use two decimals, while GM% is rounded to an integer.
- **Monthly Fees displays literal `0` for every year**, even though the calculation adds `plData.otherMonthlyFees` to revenue and margin (`1528-1538`). The real-value cells are commented out.
- A bottom **Save Changes** button calls `handleSaveChanges` (`1750-1770`). The alternative header-save registration and “No Saved Corridor Data” information card are commented out (`169-185`, `1339-1363`).

### 3.2 Data sources, membership, and timing

- Saved corridor results come from `useCorridorResultsStore`; P&L aliases `getAllNonDeletedSavedCorridors` to the local name `getAllSavedCorridors` (`PLTab.tsx:221-228`). This removes parent-quote JSON deletion keys but **does not apply the downstream positive-volume filter**.
- This is not the Pricing table's currently filtered/sorted preview list. Unsaved new preview corridors are not automatically included.
- The saved-map implementation and its failure fallback are at `OLD/client/src/features/quotes/store/useCorridorResultsStore.ts:623-650`: if its filtering throws, it returns all saved rows.
- Setup amount precedence is: `plTab.plData.setupFee` when numeric, otherwise saved Setup Fee values, otherwise app-store values (`PLTab.tsx:240-250`). Fee type chooses setup versus network joining fee.
- Growth defaults are both **0**, not 15, in `OLD/client/src/features/quotes/store/useUIStateStore.ts:294-300`.
- `otherMonthlyFees` has a real writer: `useUIStateStore.ts:746-757` sets `(reversalFee + proofOfPaymentFee) * 12` from the opportunity-type defaults. `QuotingDetailsForm.tsx:144,277` calls it on opportunity initialization/change. This is an annualized assumption about two service fees, **not the actual MCF schedule and not an observed count of service requests**.
- Recalculation occurs in a large React effect (`PLTab.tsx:316-600`) and writes derived yearly data back into another store. Setup/global summary values and approval requirements are then also updated. The effect reads year-one values from its render closure when publishing approvals; this is not a clean compute-once pipeline.

### 3.3 Exact ordinary corridor-strategy formulas

Source: `PLTab.tsx:430-550`. Let:

- `V = sum(volumeUSD)`
- `N = sum(yearlyTransactions, with yearlytransactions alias fallback)`
- `F = sum(revenueFee)`
- `X = sum(fxMargin)`
- `MF = sum(marginFee)`
- `M = sum(totalMargin)`
- `S = selected setup OR network joining fee`, never both
- `O = plData.otherMonthlyFees` (already annualized by the writer described above)
- `g12 = year2over1Growth / 100`, `g23 = year3over2Growth / 100`

Year 1:

- Principal = V; transactions = N; ATV = V/N when N > 0, otherwise 0.
- Revenue = F + X + S + O.
- **Old baseline margin = M if M > 0; otherwise F + X + MF.**
- Total margin = baseline margin + S + O.
- Margin fee = MF.
- Take rate = revenue / principal * 100; margin% = total margin / principal * 100; FX margin% = X / principal * 100; GM% = total margin / revenue * 100. Each denominator uses a >0 guard, otherwise 0.

Year 2:

- Principal, transactions, fee revenue, and FX margin each multiply the Year 1 corridor amount by `(1 + g12)`.
- No one-time fee; O remains constant.
- Revenue = grown F + grown X + O.
- Total margin = `(Y1 total margin - S - O) * (1 + g12) + O`.
- Margin fee = Year 2 total margin - Year 2 FX margin. This includes O, unlike Year 1's direct sum of corridor margin fees.

Year 3:

- Corridor amounts scale by `(1 + g12) * (1 + g23)`.
- Revenue = grown F + grown X + O.
- Total margin = `(Y2 total margin - O) * (1 + g23) + O`.
- Margin fee = Year 3 total margin - Year 3 FX margin; ratios are recomputed, not averaged.

**Old-app issue — do not copy:** the non-positive-margin fallback can hide a loss and double-count revenue components. Example from the formula, not a live database test: F=100, X=0, MF=-20, M=-20 becomes an 80 baseline margin instead of -20. Preserve valid zero/negative results; represent genuinely missing pricing explicitly.

### 3.4 Tiered branches are not a reliable parity target

- `PLTab.tsx:318-428` contains an alternate calculation for exact strategy names `Trx Fee Tiered Pricing` and `Fx Tiered Pricing` using `engine.tieredPLInputs`.
- It uses `totalMargin = revenueFee + fxMargin` with costs not wired, and clamps derived margin fee with `Math.max(0, ...)` (`388-395`).
- Another aggregation supports monthly/yearly t0–t3 tables; monthly amounts divide by 12, but `gmPercent = marginPercent` (`770-848`), conflating different denominators.
- Those two strategy options are commented out in the actual selector (`OLD/client/src/features/quotes/components/TechnicalDetails.tsx:181-185`). Stored legacy values could still reach the conditional branches, but users cannot ordinarily select them there.
- NEW supports mixed standard/tiered corridors with working shared math. P&L should consume each corridor's computed aggregate exactly once; any tier drill-down should be a breakdown of that result, not a second pricing model.

### 3.5 Save/API/schema and failure behavior

- `handleSaveChanges` calls `saveDiscounts()` first, then sends the entire P&L snapshot with computed `yearlyData` to `updateQuoteWithPLData` (`PLTab.tsx:69-137`).
- `OLD/client/src/features/quotes/services/plApiHelper.ts:39-79` writes the snapshot into `localStorage['pf:quotes:current']` **before** `quotesApi.update` sends `{ pricingProjectionsSnapshot: plTabState }` to the quote update endpoint.
- Persistence is the nullable JSONB `quotes.pricing_projections_snapshot`, added by `OLD/server/database/migrations/1758000000100_add_quote_snapshots_and_fields.ts:20-26`.
- `OLD/server/app/features/quotes/services/quotes_service.ts:203-226` strips HTML inside snapshots and merges/saves them; it does not recompute or validate the P&L formulas.
- A failed API save is caught and logged, but the component still displays **“P&L changes saved successfully! Pricing calculations updated.”** and starts its five-second button cooldown. This is false-success behavior, not a save UX to replicate.

### 3.6 Approval indications

Source: `OLD/client/src/features/quotes/lib/approval-guidelines-for-pl.ts:29-107` and `PLTab.tsx:1541-1725`.

- GM minimum: 60% New partner, 45% Upsell.
- Margin% minimum: 0.40% without B2B; 0.25% if any B2B corridor exists.
- Negative FX margin and negative FX margin% require attention.
- Margin% comparisons round to two decimal places first; GM comparisons do not. Precision policy is a business decision to confirm.
- Red cells/warning symbols and tooltips explain threshold violations; GM cells turn green when passing. These are **approval exceptions**, not necessarily invalid user input.
- Save/finalize sends Year 1 values under names ending in `All` (`PLTab.tsx:104-115`; `QuoteEditor.tsx:724-733`). Do not assume “overall” means all contract years.
- The approval-store B2B check uses **all saved corridors**, whereas the P&L UI uses non-deleted saved corridors (`quotes.approvals.store.ts:197-205`). Deleted B2B rows can therefore influence one threshold but not the other.

### 3.6a Worked examples under the resolved D1–D4 rules (Step 0, 2026-09-17)

These illustrate `computeQuotePnl` behavior once D1–D4 (section 7) are implemented in Step 1. They are hand-calculated per the resolved rules, not extracted from a live database.

**(a) Negative margin flows through unfallbacked (D3).** Two saved, non-deleted, positive-volume corridors: Corridor A has `revenueFee=100, fxMargin=0, marginFee=-20, totalMargin=-20`; Corridor B has `revenueFee=50, fxMargin=10, marginFee=15, totalMargin=25`. If Corridor B is not saved/active, `M = -20` for Year 1 total margin, reported as **-20**, never replaced with `F + X + MF = 100 + 0 + (-20) = 80` (the old app's fallback branch). Old-app behavior would have shown 80; NEW must show -20.

**(b) Zero-volume corridor excluded from totals (D2).** Corridor C is saved, non-deleted, but has `volumeUSD=0` alongside Corridor A and B above (both volume > 0). Under D2, Corridor C's revenue/margin/transaction figures are excluded from every P&L sum (`V`, `N`, `F`, `X`, `MF`, `M`) and from the corridor count used for approval-threshold denominators — regardless of what values it carries. This applies identically in Quoting Summary and Approvals once those steps are built, so the same quote never shows a different total corridor count on different tabs.

**(c) Explicit 0% growth stays at 0% (D4, contrasted with old Summary's bug).** Given Year 1 `totalRevenue = 1000` and the user explicitly sets `year2over1Growth = 0`, Year 2 revenue = `1000 * (1 + 0/100) = 1000` — flat, not grown. This must never silently substitute a `15` default the way old Quoting Summary's `(storedGrowth || 15) / 100` did (section 4.3) — an explicit `0` is a valid, distinct value from "not yet set," and only an actually-missing/undefined input may fall back to a documented default (proposed default: `0`, to be confirmed in Step 1, not `15`).

### 3.7 What remains for NEW

A shared, pure projection function; persisted growth inputs rather than browser-computed output snapshots; a backend-authoritative P&L read endpoint; live growth preview using that same function if approved; coherent yearly fee/margin rules; completeness and threshold results; and the actual P&L UI. Detailed step sequence is in section 8.

## 4. Quoting Summary: exact old behavior and remaining implementation

### 4.1 Screen content

Source: `OLD/client/src/features/quotes/components/QuotingSummary.tsx:2316-2558`.

1. **Partner Information:** name, region, country, partner type, opportunity owner, PR code.
2. **Contract Details:** duration, unique funding/payout currency-pair count, total corridor rows, monthly commitment, waived months, TCV.
3. **Setup Fees:** selected one-off fee type, total fee, payment schedule, and custom milestones/descriptions.
4. **Financial Projections:** Year / Volume / Transactions / Revenue, plus contract-total row.
5. **Corridor Summary by Region:** Region, Countries, Corridors, Avg. Fee (USD), Avg. FX Spread (%), Expected Volume, Projected Revenue; final counts/volume/revenue totals.

The **Approval Status** block is commented out (`2561-2586`). Its initial `pricingApproved/salesApproved/financeApproved` values are not real workflow decisions. Do not render these as authoritative approval badges in the rebuild.

### 4.2 Membership and data sources

- `corridorData` starts with saved corridor rows, removes the quote's JSON deletion keys, overlays selected staged fields, and then filters to volume >0 (`96-181`). It does **not** union in every unsaved catalog preview row.
- Overlay fields include fixed fee, variable fee, FX spread/source, volume, transactions, total revenue, and fee currency. This is a partial hand-maintained overlay, not a reuse of the Pricing table row-view builder.
- Positive-volume membership is defined by `OLD/client/src/features/quotes/utils/corridorVolumeActivity.ts:23-70`. Zero is intentionally meaningful and reversible, not a missing-value fallback.
- Currency pairs are distinct `fundingCurrency-payoutCurrency` strings (`282-287`). Multiple currencies create multiple rows; corridor count is not distinct catalog-corridor count.
- Header data mixes quote snapshots, relations, and app stores. Initial/default fallback country/region can become **Algeria/Africa** (`184-237`, `294-358`). Missing business data must remain missing in NEW.
- TCV is `setupTCV`, not the sum of projected transactional revenue. Monthly commitment is a single `setupFinalCommitmentFee`, so the header alone cannot explain a changing schedule.

### 4.3 Region aggregation and financial projection differences

Sources: `QuotingSummary.tsx:362-444`.

- Countries are distinct per region; rows count individually.
- Average fee and spread are **unweighted arithmetic averages across rows**.
- Fee precedence starts with `standardFixedFeeUSD`, then quote-fee aliases. Spread precedence starts with `fxMinimumSpread`, then minimum/applied spread. This can show catalog/default/minimum values rather than the actual quoted fee/spread.
- Volume and revenue are summed using multiple `||` alias fallbacks, which treat legitimate zeros as absent.
- Year 1 projection sums only the selected corridor data's volume, transactions, and totalRevenue. It does not add P&L one-off/other-monthly-fee amounts.
- Growth is `(storedGrowth || 15) / 100` for each later year. **An explicitly chosen 0% becomes 15%.** This disagrees with P&L's default/explicit zero growth.
- The screen shows `min(contractLength, 3)` years, but labels its total with the full contract length (`2467-2504`). A longer contract can be mislabeled.

**Rebuild implication:** share the approved projection result with P&L. If commercial users need a corridor-only projection alongside full P&L revenue, give those measures different explicit names; do not silently present different definitions as “Revenue.” Keep committed TCV distinct from forecast revenue.

### 4.4 Actual export buttons and routes

| Action | Visible condition | Active implementation |
|---|---|---|
| Generate Sales Quotation | Button not restricted to approved quotes | `handleExportToExcel:1096-1122` calls backend SD Quotation download. |
| Export for Bulk Configurator | Quote status approved | `handleExportForBulkConfigurator:1524-1549` calls backend, receives one or more files. |
| Upload to Salesforce | Approved; disabled while uploading or no active corridor data | `handleUploadToSalesforce:1695-1724`; confirmation then backend generation/upload. |
| Export Quote PDF | **Commented out** | Large browser PDF handler exists but the button is not active (`2588-2595`). |
| Send to Client | **Commented out** | Not a shipping action (`2622-2624`). |

The former browser Excel and upload handlers remain named `...Legacy` but are not the current button handlers. Do not report them as the active Sales Quotation implementation.

`OLD/client/src/features/quotes/services/documentApi.ts` defines:

- `GET /api/quotes/:quoteId/documents/sd-quotation` -> XLSX binary; browser honors Content-Disposition filename and revokes the object URL (`11-45`).
- `GET /api/quotes/:quoteId/documents/bulk-configurator` -> `{ success, files: [{ fileName, data: base64 }] }`; browser downloads each (`51-95`).
- `POST /api/salesforce/upload-sd-quotation` with `{ quoteId }` (`101-115`).

Active handlers' pre-export `saveQuoteDraft` calls are commented out. The browser summary may show staged values while the backend-generated workbook uses older persisted values. Loading state exists, but the two generation buttons do not disable themselves from it (`2597-2610`).

### 4.5 Backend Sales Quotation and Bulk Configurator content

Sources: `OLD/server/app/features/quotes/controllers/quote_documents_controller.ts:37-125`; `services/documents/quote_document_service.ts:33-265,354-395,437-556`; `services/documents/data_transformer.ts:88-142,340-387,564-798`.

- Sales Quotation uses **ExcelJS** to open `server/app/features/quotes/templates/sd_quotation_template.xlsx`, populate the first worksheet, preserve styles/merges, and return a buffer.
- Includes fee/funding/source currency, duration, selected one-off fee, MCF type/blocks, payment schedule/milestones, billing starts, rebate information, monthly commitment schedule, other pricing line items, and corridor commercial terms.
- Actual corridor mapping has 16 values: region, country, service, transaction type, payer, payout currency, funding currency, source currency, fee currency, converted fixed fee, variable fee, FX source, FX spread, payment speed, min amount, max amount (`populateCorridors:370-393`). No per-tier breakdown is populated by this mapper.
- Some commercial headings are hardcoded, including **Traditional FX** and **Corridor Pricing** (`76-95`); do not copy these regardless of quote fields.
- The document data transformer excludes persisted deleted rows and volume <=0, sorts by country, enriches catalog metadata, and converts fees using stored currency rates. It still has a **missing rate ->1** fallback and `||` fixed-fee fallback (`710-798`). Preserve zero fees and missing-rate errors instead.
- Bulk Configurator groups output by funding currency and uses the template `OLD/server/app/features/quotes/templates/bulk_configurator.hbs:1-73`.
- Bulk columns: PR Code, Region, Country, Service, Transaction Type, Payout Currency, Payer, Country ISO Code, Volume, Funding Currency, Source Currency, conditional Static Rate, Fee Currency, Fixed Fee, Variable Fee, FX Source, FX Spread, conditional Thunes Commission on Spread, Payment speed, Min amount, Max amount, FX Source code, Service ID, Payer ID, FX, Receiving Partner. Partner Share is commented out.
- NEW's catalog type currently lacks several configurator metadata fields. This export is a separate integration contract, not the already-built Pricing table workbook.
- The two controller download methods check quote visibility but not approved status; the Bulk Configurator restriction is currently in the frontend. NEW must enforce any required approval gating on the server.

### 4.6 What remains for NEW

A read-only summary backed by canonical quote/setup/P&L values; region aggregation with agreed averages; explicit saved-versus-preview semantics; error/completeness indicators; and separately scoped official Sales Quotation/Configurator exports. No new “summary totals” database table is needed just to render the summary. Salesforce upload is a separate integration decision, not implicitly part of building this tab.

## 5. Legal: exact old behavior and remaining implementation

### 5.1 Final Quotation and action visibility

Source: `OLD/client/src/features/quotes/components/Legal.tsx:1019-1183,1695-1919`.

- **Final Quotation** shows one-off/other fees and a corridor commercial-terms table.
- Corridor columns: Country, Service, Transaction Type, Payout Currency, Payer, Fee Currency, Fixed Fee, Variable Fee, FX Spread, FX Source; Partner Share and Thunes Share appear for revenue-share quotes/rows. Volume columns are commented out.
- Its screen uses `getAllActiveSavedCorridors`. That helper filters membership using staged volume but returns saved objects, not a fully recomputed staged row. Zero-volume changes can affect membership immediately while other values remain saved.
- Currency conversion uses `computeFixedFeeInFeeCurrency`; do not copy its old missing-rate fallback.
- `actualCommitmentFee = setupFinalCommitmentFee || 6000` fabricates 6000 when the real fee is zero (`1075-1095`). Initial arrays also contain 6000 (`1047-1052`). These are not trustworthy defaults for new documents.
- **Generate Legal Contract** is visible without the approved-status restriction.
- **Generate Term-sheet** (PDF/DOCX hover menu) is visible when approved.
- Fee Annex **Edit/Preview** is always available; PDF/DOCX buttons require approved status and a saved annex.

### 5.2 Four different outputs, not one generic contract feature

| Output | Generation and data source | Source anchors |
|---|---|---|
| Legal Contract XLSX | Browser `exportLegalContractExcel()` imported from QuotingSummary. Uses saved corridor objects/store commercial values, not the server Sales Quotation endpoint. | `Legal.tsx:1600-1618`; `QuotingSummary.tsx:2911 onward`. |
| Fee Annex PDF | Backend renders the **latest persisted HTML annex version** with Puppeteer. | `Legal.tsx:1432-1448`; `documentApi.ts:121-151`; `fee_annex_pdf_service.ts:23-129`. |
| Fee Annex DOCX | Browser selects editor DOM, then live-content ref, then saved template; sends `{ html, fileName }` to generic HTML-to-DOCX conversion. | `Legal.tsx:1514-1597`; `quotes_controller.ts:1428-1468`. |
| Term-sheet DOCX/PDF | Backend fills a DOCX template from quote fields/snapshots; PDF additionally requires LibreOffice. | `Legal.tsx:1654-1679`; `termsheet_service.ts:27-219`. |

Legal XLSX details: the browser uses `xlsx-js-style` (`QuotingSummary.tsx:12,3374-3519`) and writes one worksheet named `Quotation` with a **Legal Summary** title/layout: commercial terms, one-off fees, MCF schedules/period blocks, other fees, and corridor rates. The sanitized filename is `Legal Contract - <PR number> - <Account Name>.xlsx`, preferring Salesforce snapshot identifiers with local quote fallbacks (`3505-3519`). `showFxSpreadInContract === 'YES'` and `showFxSourceInContract === 'YES'` control disclosure in this exporter (`QuotingSummary.tsx:2922-2923`). Revenue-share output depends on the quote/row flags; a pegged-rates block is intentionally absent in this layout (`2972-2990`). It is not the same on-screen/internal financial workbook as Pricing's Download Corridors.

`handleGenerateContract` also increments an in-memory `contractInfo.version` and marks generated before running the export. This does **not** create a durable signed/generated contract record. The nearby `handleApprove`, `handleReject`, and `handleCommentChange` merely change local legal state and have no active JSX action bindings; they are not the real Approvals workflow.

### 5.3 Fee Annex editor and persistence

- `Edit/Preview` opens a custom editor modal. Existing per-quote content is loaded; absent content starts blank (`Legal.tsx:1208-1234`).
- `handleFileUpload` accepts DOCX (Mammoth converts to HTML) or HTML; rejects PDF/other file types (`1237-1264`).
- `populateAndLockSections` (`164 onward`) populates financial sections in the document DOM and locks generated sections. An editor-permission flag comes from `GET /api/legal/template-permissions` (`Legal.tsx:31-46`; backend `legal_controller.ts:12-20`). The backend calculates that flag from an environment-configured allow-list; no email values are recorded here.
- Google Drive service health, template listing, selected-template fetch, and cached-template conversion are wired in this UI (`1185-1205`, `1372-1415`). These require a real integration, not a static picker.
- Save reads live DOM/ref/state, removes `display:none` elements, and calls `saveFeeAnnexTemplate`. On success it shows a brief Saved state, closes, and can return to the quote-finalization flow (`1267-1307`).
- Store save optimistically writes local state **before** the network request, rethrows failure but does not roll back (`quotes.current.store.ts:1850-1878`). Thus local “has saved annex” checks can disagree with the database after a failed save.
- Backend sanitizes HTML, checks quote-update access, and explicitly skips the status restriction for annex edits (`fee_annex_controller.ts:88-162`). It creates a new version only when content changes; name-only changes update the current version.
- Schema: `fee_annex_versions` has quote FK, integer version, name, HTML content, modifier identity, timestamps, and unique `(quote_id, version)`. `fee_annex_comments` belongs to the quote rather than a version, so comments survive new versions. See `OLD/server/database/migrations/1766000000001_create_fee_annex_system.ts:11-89`.
- Version creation is read-latest-plus-one without a surrounding allocation transaction in the inspected controller. The unique constraint prevents duplicate numbers but concurrent saves can fail; the rebuild should not reuse that race.

### 5.4 Comments and misleading success behavior

- Comment UI supplies text and author metadata, calls asynchronous `addFeeAnnexComment` **without awaiting it**, then separately attempts a legal-team notification (`Legal.tsx:1311-1360`). It can display “Comment added and legal team notified!” after notification failure.
- Store comment creation is optimistic, persists through the API, and rethrows errors (`quotes.current.store.ts:1880-1927`). Failure is not reliably caught by the unawaited UI call.
- **Delete comment is local-only** (`1930-1945`); the routed API has POST/GET comments, not DELETE. Reloading database comments can bring the comment back.
- Latest content and comments reload together on quote opening (`1950-1985`). A 404 is suppressed.
- These are reasons to keep collaborative editing/comments out of the first implementation as FEATURES already specifies, not reasons to copy a cosmetic editor.

### 5.5 Routes, formats, and deployment requirements

Active `OLD/server/start/routes.ts:976-1089` registers:

- `POST /api/quotes/html-to-docx` -> binary DOCX from supplied HTML; this is not quote-scoped.
- `POST /api/quotes/:id/fee-annex` `{ name, content }` -> `{ success, data, message }`.
- `GET /api/quotes/:id/fee-annex` -> latest version or 404.
- `GET /api/quotes/:id/fee-annex/versions` -> versions.
- `POST /api/quotes/:id/fee-annex/comments` `{ commentText }`; GET on the same path lists comments.
- `GET /api/quotes/:id/fee-annex/pdf` -> binary PDF.
- `GET /api/quotes/:id/termsheet/pdf` and `/docx` -> binary document.

The term-sheet controller checks visibility, **not quote approved status** (`termsheet_controller.ts:12-107`). The frontend-approved-only rule is not server enforcement.

Term-sheet renderer (`termsheet_service.ts:66-219`):

- Uses PizZip and Docxtemplater with `Commerical Term Sheet for EMI Money SARL.docx`.
- Maps company legal name/address/country, licenses, sponsor bank, settlement/funding fields, contract duration, selected fees, use cases, implementation dates, and contract template/signature fields from quote snapshots.
- Unmatched fields silently become empty strings. Broad substring matching can collide: `accept_settlement_method` contains `settlement_method`, and the service relies on branch order. Exact template keys and validated data mappings are safer.
- PDF executes `soffice --headless --convert-to pdf` on a temporary DOCX. Production needs LibreOffice available, conversion limits, safe temporary-file lifecycle, and concurrency handling.
- Fee Annex PDF instead launches Puppeteer with sandbox-disabling flags and uses stored HTML. Do not adopt those deployment/security flags automatically. Approved templates, safe resource loading, renderer isolation, and timeouts must be designed for NEW.

### 5.6 What remains for NEW

At minimum: a verified legal data contract, required-field checks, approved templates, backend generation/download, disclosure rules, and a read-only Legal UI. Missing company/legal data is a prerequisite decision. A customer-facing “legal contract” must not silently substitute demo company details or treat a generated document as executed/signed. Browser editing, comment/version collaboration, Drive, Salesforce, and e-signatures are separate scope items.

## 6. Approvals: exact old behavior and remaining implementation

### 6.1 Finalization is the entry point

Sources: `OLD/client/src/features/quotes/components/QuoteEditor.tsx:605-819,1837-1960`; `OLD/client/src/features/approvals/components/SendForApprovalModal.tsx:179-305`.

1. Finalize is offered for draft/rejected quotes; handler stops for pending approvals or unsaved changes and calls quote validation.
2. It recomputes P&L and Setup approval requirements from stores even if those tabs were not visited. Pricing requirements are already in the approvals store.
3. With discrepancies it opens an Approvals Required review. Without discrepancies it asks permission to auto-approve/finalize.
4. Both flows check that a Fee Annex exists. Missing annex opens a prompt to generate/save it in Legal. Saved annex opens a review-or-proceed prompt.
5. Manual submission collects **Why is approval needed?**, **Business Impact**, **Value / Amount Impact**. Why is required in the modal; the other two are free text. Button becomes Sending while pending. The submit function has `try/finally`, but no rendered failure message of its own.
6. It creates one or more requests via the quote-scoped approvals API and refreshes quote state.

**Dependency warning:** old finalization requires a saved annex before requesting approval, while its final PDF/DOCX download buttons require approval. NEW's current roadmap puts Approvals before Legal. Decide whether v1 submission requires only financial completeness, or whether draft-annex generation must move ahead of approval submission. Do not create a circular dependency accidentally.

### 6.2 Real routing of requirements

`createApprovalForQuote` in `QuoteEditor.tsx:605-677` partitions requirements:

- `network_team` exceptions -> network-team group request.
- Other pricing and P&L exceptions -> pricing request.
- A `custom` Setup exception additionally targets the quote owner's manager, falling back to the initiator's manager, if one exists.
- With manager present, pricing goes to pricing_team; when `requiresSvp` is set it unions that group with roles matching `svp`.
- Without that manager path, pricing recipients are pricing_team, pricing_committee, csuite, plus the SVP selector when required.
- Requests use `ANY_ONE`, not “every listed department must approve.” Manager/network/pricing are separate approval records where applicable.
- Payload carries `policy`, `approvers`, and `reasons: { source: 'manual'|'auto', details: { reason, businessImpact, valueImpact, discrepancies } }`.
- These separate POSTs are issued sequentially by the browser, not in one atomic quote-submission transaction.

`OLD/server/app/features/approvals/config/approval_defaults.ts:9-17` has an **empty default chain**; the proposed chain entries are commented out. A multi-stage ladder is therefore not the normal configured flow, even though the service contains chain machinery.

### 6.3 Requirement computation versus decision records

`OLD/client/src/features/quotes/stores/quotes.approvals.store.ts` owns derived client requirements, distinct from persisted workflow requests.

- `computeFromPL:184-244` checks GM, rounded Margin%, negative FX margin%, negative FX margin; typically receives Year 1 as “overall.”
- `computeFromSetup:245-321` skips Setup exceptions for Upsell, checks non-100% payment schedule, committed Year 1 <75000, total committed <150000, waived months >=4, service/emergency fee deviations, rebate incentive, and MCF ramp-up. Custom MCF alone is commented out as a trigger.
- `merge:323-327` concatenates/deduplicates; it does not replace the whole set despite one Quoting Summary call-site comment claiming replacement. Do not make persisted workflow correctness depend on browser-store freshness.
- NEW already has server-computed corridor and Setup approval reasons. Reuse those; do not rebuild a competing client engine. A real workflow still needs server-owned submission/decision rules.

### 6.4 Actual Approvals tab UI

Source: `OLD/client/src/features/approvals/components/QuoteApprovalsTab.tsx:222-432`.

- Loads all quote approvals using `useLatestQuoteApproval`; despite the hook name, it exposes the full list, title maps, approver maps, and history.
- Pending cards sort first, then descending id.
- Empty state: **No approvals yet — Finalize the quote to request approvals.** There is no separate create button inside this tab.
- Card content: human-readable approval title, status badge, initiator, Submission (Why / Business Impact / Value Impact), discrepancy groups, approvers/policy, comment box, history timeline, and decision panel.
- Discrepancies group by Pricing / P&L / Setup, and by pricing exception type; show country, transaction type, service, funding currency, reason, and selected metadata (`28-208`).
- Snapshot discrepancies are filtered again using current staged/saved zero-volume membership (`234-243,275-278`). This can hide part of an old submission's audit evidence. In NEW, historical submission evidence should remain immutable; present current differences separately.
- Approve/Reject controls require pending status and the logged-in user in resolved approvers (`273`). UI decision comments are required (`ApprovalActions.tsx:12-44`). The server's approve/reject controller does not enforce that same required-comment rule.
- Post Comment is disabled only for empty text, not while its mutation is pending; the hooks/call sites shown do not render mutation errors (`343-413`; `hooks/useApprovalQueries.ts:8-57`). A fetch failure can resemble the empty state because the tab consumes data without displaying query error/loading state.
- Header withdraw/revoke actions live in QuoteEditor, not the per-card decision controls used here.

### 6.5 Backend API and schema

Sources: `OLD/server/start/routes.ts:578-634,1181-1215`; `features/quotes/controllers/quote_approvals_controller.ts:16-146,149-277`; `features/approvals/controllers/approvals_controller.ts:15-203`.

| Endpoint | Payload/result and purpose |
|---|---|
| GET `/api/quotes/:id/approvals` | `{ success, data: approvals[], approverUserIds, approvers, approversMap, titlesMap, titlesTreeMap }`; visibility checked. |
| POST `/api/quotes/:id/approvals` | Validated quote approval payload; service creates request; `{ success, data }` with 201. |
| GET `/api/approvals` | Optional recordType, recordId, onlyMine, includeApproverIds, includeEnriched filters. Separate approvals-list surface. |
| GET `/api/approvals/:id` | Request/history/resolved approver ids; quote visibility checked. |
| POST `/api/approvals` | Generic polymorphic approval creation; not the quote editor's main creation path. |
| POST `/api/approvals/:id/approve` or `/reject` | `{ comment? }`; authenticated actor supplied to service. |
| POST `/api/approvals/:id/comment` | `{ comment }`; strips HTML and creates history. |
| POST `/api/approvals/:id/withdraw` | `{ reason }`; withdraw applicable pending requests. |
| POST `/api/approvals/:id/revoke` | `{ comment }`; revoke approved requests. |
| POST `/api/approvals/:id/recompute` | Admin-permission-gated route; not needed for simple v1. |

Migration `OLD/server/database/migrations/1757000000001_create_approvals_system.ts:11-86` defines:

- `approvals`: polymorphic `record_type` text + `record_id` integer (not a direct quote FK), status text default pending_approval, policy text default ANY_ONE, approvers_json required JSONB, reasons_json/chain_json nullable JSONB, current_step_index default 0, nullable initiator FK/comment/due date, audit fields, indexes.
- `approval_history`: approval FK, nullable actor FK, event_type, event_payload JSONB, timestamp. A later migration adds `actor_sources_json`, reflected in `server/app/models/approval_history.ts:25-45`.
- Model statuses also include auto_approved, approved, rejected, withdrawn, revoked (`server/app/models/approval.ts:20-29`).
- Resolver supports users, roles, profiles, groups, union/intersection (`approver_resolver_service.ts:39-83`). This depends on a much richer identity model than NEW currently has.

### 6.6 Real transitions and important defects

Source: `OLD/server/app/features/approvals/services/approval_service.ts`.

- **Create** (`166-285`): resolves selectors, attempts pending-request deduplication, snapshots notes, creates approval/history and sets quote awaiting_approval in a transaction, then notifies approvers after commit.
- **Approve** (`318-439`): checks eligibility, writes approved history, marks the request approved immediately, optionally spawns a next chain step. When no pending requests remain, sets quote approved/closed_date and starts asynchronous Salesforce uploads.
- **Reject** (`441-497`): checks eligibility, writes rejected history/status, sets quote rejected and marks other pending requests rejected with archived metadata.
- **Withdraw** (`521-649`): initiator, quote owner, pricing team, or admin can withdraw. Initiator-only path limits to their requests; broader actors affect all pending requests. Transaction updates requests/history and sets quote draft.
- **Revoke** (`651-734`): eligible approver for the selected request revokes all approved requests for that record, records history, and returns quote to draft.
- Notifications and document uploads are real code-backed side effects; they are not automatically included in NEW v1.

**Old-app issues — do not copy:**

1. Approve does not count ALL_MEMBERS votes or branch on policy before setting approved (`318-341`). The schema/UI promise more than it implements.
2. Approve/reject have no pending-status guard and no enclosing transaction covering decision, history, and quote transition. Eligibility alone must not permit changing historical terminal decisions; concurrent requests need safe transitions.
3. Final approval checks “no pending requests,” not that all required current-round requests are approved. With no explicit round/revision binding, older requests and repeated decisions can affect current status.
4. Quote-scoped create auto-approves when client-supplied `reasons.source === 'auto'`, choosing the first resolved approver as the acting identity (`quote_approvals_controller.ts:255-273`). Auto-approval must be a server-evaluated rule with honest system attribution, not a client claim impersonating a human decision.
5. Pending deduplication is an application query before insertion (`approval_service.ts:124-187`), not a demonstrated database-enforced submission uniqueness rule.
6. Generic list/comment paths do not mirror the quote visibility checks found in show/quote-list (`approvals_controller.ts:70-80,166-190`; `approval_service.ts:499-518`). Build explicit authorization tests for every action rather than trusting authenticated-only routes.
7. Resolver intersection uses an empty accumulator as “not initialized” (`approver_resolver_service.ts:79-82`); an empty intermediate intersection can incorrectly reset to a later list. Do not copy that generic resolver.
8. Dynamic approver lookup is not a frozen assignment list; later group changes can change who is eligible. Decide assignment semantics deliberately.

### 6.7 What remains for NEW

An explicit submission/decision lifecycle, a server-authoritative review data set, permissions, durable decision/audit records, quote-status enforcement across every edit endpoint, hooks and UI, and failure/concurrency tests. Full group routing, chains, auto-approval, comments, withdrawals/revocations, notifications, and external uploads remain decisions beyond the currently documented simple v1.

## 7. Decision register: resolve before the relevant implementation step

D1–D6 were resolved with the user on 2026-09-17 (Step 0). D7–D12 remain open and must not be guessed past when their steps arrive.

| ID | Decision | Evidence/problem | Resolution |
|---|---|---|---|
| D1 | P&L population | Old P&L saved-only; old Summary overlays some edits; documents mostly saved-only. | **Resolved:** Official P&L, Summary, Approvals, and Documents all read **saved (persisted), non-deleted corridor rows only**. A live/unsaved-edit preview may exist later as a clearly labeled, separate adapter using the same shared math — never blended into official totals. |
| D2 | Zero-volume membership | Old Summary/Legal/docs filter >0, P&L does not consistently. NEW permits zero volume. | **Resolved:** One consistent rule everywhere — corridors with 0 volume are **excluded** from P&L/Summary/Approvals/Documents totals, averages, and counts. Pricing tab's own row list/restore state is unaffected; this rule applies only to downstream aggregation. |
| D3 | Recurring revenue and margin | Old service fees annualized without event counts; MCF is a separate commitment measure; literal UI zeros hide O. | **Resolved:** Never substitute a fallback for a negative or zero margin — the real (possibly negative) total is always shown. Do not annualize speculative service fees (reversal/proof-of-payment guesses) without real data; unknown recurring-fee inputs are **$0**, not a guess. Recurring revenue beyond one-off Setup Fee is added only when backed by actual Setup Fee/MCF schedule data — Step 1 must specify exactly which Setup Fee fields feed in. |
| D4 | Projection horizon/growth | Three-year P&L; summary mislabels longer totals; NEW permits 1–20 years and noninteger input. | **Resolved:** Fixed **3-year projection** (Year 1/2/3, two growth-rate inputs: Year2-over-1, Year3-over-2), regardless of contract length. Never mislabel it as a full-contract total. |
| D5 | Numeric/approval precision | Old percentage rounding and fallback behavior differ. | **Resolved (default, revisit if wrong):** Currency amounts round to whole units for display, percentages to 2 decimals, GM% to nearest integer (matches old app's own GM% display). Zero-denominator guards return `0`, never `NaN`/`Infinity`. Rounding happens once at the API response boundary; internal computation stays full-precision. |
| D6 | Regional averages/revenue labels | Old unweighted default/minimum values may not be quoted values. | **Resolved (default, revisit if wrong):** Regional "Avg. Fee"/"Avg. FX Spread" use **actual quoted values** (not catalog defaults/minimums), as **simple (unweighted) averages**, explicitly labeled as such. Corridor-only projected revenue and committed TCV stay separately named fields, never merged into one ambiguous "Revenue" number. |
| D7 | Approval v1 scope and authority | FEATURES says one simple record; old has multi-group manager/network/pricing routes. | Open — resolve before Step 5. |
| D8 | Approval evidence/revisions | Historical records can be filtered by current live edits; repeat submissions unscoped. | Open — resolve before Step 5. |
| D9 | Annex before approval | Old finalization blocks without saved annex; NEW Legal is scheduled after Approvals. | Open — resolve before Step 5. |
| D10 | Documents and gates | Sales quotation, legal XLSX, fee annex, term sheet are different artifacts. | Open — resolve before Step 7. |
| D11 | Legal data and runtime | Current NEW fields cannot populate the old comprehensive term sheet; PDF requires non-JS runtime components. | Open — resolve before Step 7. |
| D12 | Save/commit gates | Prior requested workflow requires backend review before frontend; root docs describe overall feature gates. | Standing process rule, not a per-feature decision — already governs every step (see section 9). |
| D7 | Approval v1 scope and authority | FEATURES says one simple record; old has multi-group manager/network/pricing routes. | Start with a server-assigned single approver and explicit permissions, no generic resolver/chains. Confirm who can approve, self-approval, reassignment, rejected-to-draft handling, and whether simple v1 still meets the business need. |
| D8 | Approval evidence/revisions | Historical records can be filtered by current live edits; repeat submissions unscoped. | Freeze submitted evidence and bind decisions to that submission. Agree one record per quote versus one per submission with only one active request. The latter preserves resubmission history but extends the literal old v1 wording. |
| D9 | Annex before approval | Old finalization blocks without saved annex; NEW Legal is scheduled after Approvals. | For simple v1 require financial completeness, not an editable annex. If the annex must be approved too, build draft generation first and freeze its version with submission. |
| D10 | Documents and gates | Sales quotation, legal XLSX, fee annex, term sheet are different artifacts. | Confirm required v1 outputs and templates; allow clearly labeled internal/draft previews where appropriate, enforce approved-only final downloads on server. No silent addition of Salesforce/Configurator/Drive. |
| D11 | Legal data and runtime | Current NEW fields cannot populate the old comprehensive term sheet; PDF requires non-JS runtime components. | Validate an exact template field matrix; collect missing legally-required inputs in an approved backend step. Choose renderer/runtime after a small deployment feasibility check. Fail clearly for missing required data. |
| D12 | Save/commit gates | Prior requested workflow requires backend review before frontend; root docs describe overall feature gates. | For each slice: plan approval -> backend/tests/Postman execution -> user verification/explicit backend commit authorization -> frontend/manual test -> user confirmation/commit. No commits or next feature without the user gate. |

## 8. Proposed step-by-step implementation roadmap

This is a sequence of small slices, **not permission to execute a batch**. Finish one slice, demonstrate it, and get confirmation before moving on. File names and routes in this section are proposed NEW paths; existing files are explicitly identified. Do not create every listed file in advance.

### Step 0 — Agree calculation and scope contracts

Deliverable: update this document's decision register with the user's choices and worked financial examples. Resolve D1–D6 for P&L first; D7–D11 can wait until their slices but must not be guessed past.

- Confirm the saved-row versus preview boundary and zero-volume behavior.
- Resolve the old non-positive-margin fallback, monthly-fee mismatch, and MCF revenue recognition with finance/product input.
- Define three-year versus contract-length semantics and labels.
- Record v1 omissions explicitly rather than presenting them as parity.
- No migrations/UI yet. Recommended first executable slice after this approval: Step 1 backend only.

### Step 1 — P&L shared computation and backend

Proposed files:

- `packages/shared/src/lib/quote_pnl_math.ts`: pure `computeQuotePnl(inputs)` with typed raw inputs, yearly results, named totals, completeness/threshold results as agreed. No React/Lucid imports and no browser-store access. Reuse corridor aggregates; reuse Setup schedule functions rather than duplicating month logic.
- `packages/shared/src/types/quote_pnl.ts` if API DTOs are distinct from math inputs; avoid two competing result interfaces. Barrel export via existing `packages/shared/src/index.ts`.
- `apps/server/database/migrations/<timestamp>_add_quote_projection_inputs.ts`: proposed explicit `year2_growth_pct` / `year3_growth_pct` numeric inputs on quotes (or a one-to-one inputs row if selected in D4). Defaults only after agreement. Do not store client-derived P&L lines as an opaque JSON snapshot.
- Existing `app/models/quote.ts`; new `app/validators/quote_pnl.ts`, `app/services/quote_pnl_service.ts`, `app/controllers/quote_pnl_controller.ts`; existing `start/routes.ts`.
- Existing `quote_access_service.ts`: reuse admin/owner checks and deliberately extract a reusable editable-quote loader only if actually needed. Do not couple a read endpoint to the existing file-local corridor loader.

Proposed API:

- `GET /quotes/:quoteId/pnl` -> `{ inputs, years, totals, completeness, approvalRequirements }`, with exact fields agreed from shared types.
- `PUT /quotes/:quoteId/pnl` -> accepts **projection inputs only**, computes and returns the same shape. Draft-only mutation; unknown/output fields rejected or excluded by boundary schema. This route is an inputs update, not “save these calculated profits.”

Data rules:

- Load active saved corridors, aggregate their already-computed results once, and load normalized Setup Fee data.
- Decide how stale/null computed fields are repriced or reported incomplete. Never silently turn unpriced rows into valid zero-priced rows.
- Return distinct component fields (`revenueFee`, `fxMargin`, `marginFee`, one-off/recurring income, totalRevenue, totalMargin) so users can reconcile totals.
- Apply agreed precision once at documented boundaries. Do not average percentage columns or drop losses.

Backend tests before UI:

- Hand-calculated standard, tiered, mixed, multiple-funding-currency fixtures.
- Zero growth remains zero; negative growth boundary; invalid/unbounded/nonfinite inputs; blank/missing behavior.
- Negative/zero margin preserved, zero denominators, null computation completeness.
- One-off fee appears once; agreed recurring-fee schedule and waived months; no MCF double counting.
- Deleted rows excluded; zero-volume rule; restore changes result; no hidden Pricing filters affect official totals.
- Empty quote, no setup fee, contract shorter/longer than forecast horizon.
- GET auth/ownership, PUT draft-only, viewer behavior, and field-level 422 errors.
- Update and execute Postman requests/assertions in the same step; obtain user backend verification before commit/front-end work.

### Step 2 — P&L frontend only after Step 1's gate

Proposed `apps/client/src/features/quotes/api/useQuotePnl.ts` and `components/PnlTab.tsx`; replace only the P&L placeholder in existing `pages/QuoteEditorPage.tsx`.

- Hooks own HTTP and invalidation; TanStack Query owns persisted results. Local or per-tab Zustand state contains only unsaved inputs, not another copy of server P&L.
- Two growth fields and explicit Save if the three-year design is chosen. Shared function supplies optional live growth preview, clearly marked unsaved.
- Component rows and values reconcile; no literal zero masking computed monthly fees. Display 0 distinctly from missing data.
- Reuse UI primitives and existing `apps/client/src/lib/api-error.ts` for readable field/row/global errors. Approval warnings remain distinguishable from validation failures.
- Test save/failure/retry, tab switch/reload, separate open quotes, edits followed by P&L refresh, loss cases, and thresholds. User personally tests before commit.

### Step 3 — Quoting Summary backend read model

Proposed `app/services/quote_summary_service.ts`, `app/controllers/quote_summary_controller.ts`, `packages/shared/src/types/quote_summary.ts` and, only if truly used by both runtimes, shared regional aggregation helpers.

- `GET /quotes/:quoteId/summary` proposed response: `{ partner, contract, setupFee, projections, regions, completeness }`. Approval status is added only when a real workflow exists.
- Reuse the P&L service for projections and the normalized Setup Fee calculation for committed TCV. Do not recompute growth with a second default.
- Count distinct funding/payout pairs and countries; use agreed quoted-fee/spread averages and activity rules.
- No new summary database table. Keep a single projection implementation even if a dedicated summary endpoint is chosen over composing existing reads.
- Test P&L/summary agreement, 0% growth, zero fees, multi-currency counts, no fabricated partner country, deletion/restoration, long contracts, and access control. Postman and user backend gate as above.

### Step 4 — Quoting Summary frontend

Proposed `api/useQuoteSummary.ts`, `components/QuotingSummaryTab.tsx`; replace its placeholder.

- Build the five verified read-only sections with accurate NEW field names and agreed monetary definitions.
- Show incomplete/missing data explicitly. Link the user to the correct upstream tab to fix it.
- If official summary is saved-only, display a clear unsaved-changes notice rather than mixing pending header/corridor values into only some cards.
- Do not expose a fake approval status or inert export action. Official exports come in their own slice.
- Test consistency against P&L and Setup Fee, region averages/counts, multi-currency lanes, zero volume, and empty/error states. User verification/commit gate.

### Step 5 — Approval backend and authorization

Resolve D7–D9 first. The current documented simple v1 should stay simple unless the user approves the fuller workflow.

Proposed files: timestamped approval migration, `app/models/quote_approval.ts`, `app/validators/quote_approval.ts`, `app/services/quote_approval_service.ts`, `app/controllers/quote_approvals_controller.ts`, shared approval DTOs, routes and access policies.

- Use a real quote FK, approver/requester/decider identities, status/decision/comment/timestamps; decide immutable evidence/submission revision storage explicitly. No polymorphic JSON approver resolver for a quote-only v1.
- Suggested routes: `POST /quotes/:quoteId/submit`, `GET /quotes/:quoteId/approvals`, `POST /quotes/:quoteId/approvals/:approvalId/decision` with `{ decision: 'approved'|'rejected', comment }`. Exact paths/contracts require approval before coding.
- Submission recomputes/reconciles authoritative review data and checks completeness on server. Never accept client-supplied “no discrepancies” as authorization.
- Use quote status `submitted` as the pending lifecycle if confirmed; prohibit edits to submitted/approved quote header, setup, corridor/tier, projection and deletion/restore inputs.
- Atomically create submission/evidence and change quote status; atomically record a valid pending decision and quote outcome. Use locking/conditional updates plus the agreed uniqueness constraint for concurrent submissions/decisions.
- Reject unauthorized/self-approval according to chosen policy; distinguish quote-view access from permission to decide.
- Do not send notifications or upload files as an unreviewed side effect. If later approved, use reliable post-commit delivery and explicit retry/idempotency design.

Tests: own/admin/assigned-approver/other-user/viewer/inactive-user matrix; missing setup/P&L/corridor data; cannot submit unsaved client values; valid transitions; repeated/racing submit or decision; historical decisions immutable; required comment; cannot edit through any endpoint while pending/approved; rejected resubmission policy; transaction rollback. Execute Postman lifecycle and obtain user backend sign-off.

### Step 6 — Approvals frontend and editor action

Proposed `api/useQuoteApprovals.ts`, `components/ApprovalsTab.tsx`, submission/decision dialog components; wire QuoteEditorPage header/state.

- Empty, loading, error and retry states must be distinct.
- Show actual review facts, submitter/approver, status, required comment, decision time, and whatever history was approved for v1.
- Group exception reasons by Pricing / Setup / P&L using structured results, not handcrafted HTML or string-parsed identities.
- Disable pending actions, surface readable API errors, invalidate quote/summary/approvals on success, and preserve unsent justification on failure.
- Hide/disable unauthorized actions for UX while relying on server enforcement.
- Implement withdraw/revoke, free-form comments, and an approvals inbox only if separately approved; the old UI having them is not v1 scope approval.
- Test two-user flow, stale screen after another person's decision, double click, rejection, refresh, and no data leaking between quote tabs. User verification/commit gate.

### Step 7 — Commercial/document contract and backend

Resolve D10–D11 and, if necessary, perform this before Step 5 for draft-annex approval.

- Build a field matrix per artifact: required inputs, source table/field, units/currency, display precision, approval gate, omitted/internal-only fields, tier display, and template revision.
- Add only required missing legal/company fields through reviewed migrations/models/validators/Postman. Do not duplicate existing quote/setup data into unvalidated snapshots just to satisfy template placeholders.
- Proposed canonical `app/services/quote_document_data_service.ts` assembles authorized persisted data once; document-specific renderers only format that DTO. Reuse this commercial view for Legal preview and downloads.
- Proposed endpoints: `GET /quotes/:quoteId/legal` for preview/completeness; `GET /quotes/:quoteId/documents/sales-quotation.xlsx`, `/fee-annex.pdf`, `/fee-annex.docx`, `/termsheet.docx`, `/termsheet.pdf` **only for the approved formats**. Legal XLSX is a separate explicit output decision.
- Select and declare renderer dependencies in the server workspace; verify packaging of templates and any browser/office runtime in Docker. No automatic installation or infrastructure change is authorized by this plan.
- Generate from a consistent data version. For reproducible approved artifacts, decide a persisted document record with quote/submission/template version, hash, generatedBy/generatedAt and storage reference versus on-demand download. Do not claim a historical artifact is immutable if it is regenerated from changing catalogs/rates.
- Enforce disclosure of FX source/spread at the DTO/renderer boundary, not only by hiding a UI column. Exclude margins, costs, internal approval notes and other confidential fields from client-facing outputs.
- Validate required company/contract fields, currency coverage, tier representation, and eligible rows. Never invent rate 1, FX model, legal company name, or fee 6000.

Tests: actual workbook/document content and MIME/disposition, Unicode/safe filename, one-off fee exclusivity, zero fees preserved, absent rates fail clearly, waived months/block/principal MCF, disclosure flags, multi-funding-currency rows, tiers, deleted/zero-volume rules, required fields, authorization/approved gate, no internal-data leakage, renderer timeout/failure, consistent revision. Execute binary Postman requests; manually open rendered files, not just assert HTTP 200.

### Step 8 — Legal UI and official download actions

Proposed `api/useQuoteDocuments.ts`, `api/useQuoteLegal.ts`, `components/LegalTab.tsx`; official quotation button in QuotingSummaryTab.

- Render final commercial terms and completeness from the same DTO used to generate approved outputs.
- Reuse Dialog/Button/Table primitives, accessible menu controls, pending states, blob-error decoding, safe download/object-URL cleanup, and readable errors.
- Display draft versus approved-document status honestly. Downloading is not signing or obtaining legal approval.
- No contentEditable, arbitrary HTML upload, Drive selector, template-edit email allow-list, or local-only comment removal in generation-only v1.
- Test all approved output formats against the screen, failure/retry, missing information/rates, approval gates, and reload. User personally opens and reviews files before commit.

### Step 9 — Optional parity backlog, each requiring its own plan

Keep these visible rather than silently forgetting them:

- Official Sales Quotation if not selected for initial document scope.
- Bulk Configurator: missing catalog metadata, exact importer schema/units, one file per funding currency or reviewed ZIP packaging, tier support and allowed status.
- Multi-group manager/pricing/network routing, true ALL_MEMBERS semantics, chains, submission rounds, withdrawals/revocations, inbox and notifications.
- Annex editing with safe template import, server-side section/permission enforcement, version locking/history, comment CRUD and legal-team notifications.
- Google Drive template synchronization.
- Salesforce linking, upload/replacement behavior, retries and post-approval uploads.
- Revenue-share terms/MBP-dependent features that are currently deferred; never print a fake share model merely because a quote-level enum exists.
- Signatures/execution tracking, retention/archiving, and additional legal templates only if actually required.

## 9. Verification and maintenance checklist

### For this research document

- [x] Checked routed old UI/API paths rather than assuming the alternate quotation modules are active.
- [x] Read concrete P&L calculations, save path, and UI output cells.
- [x] Traced Quoting Summary membership, independent growth, and active versus legacy export handlers.
- [x] Traced Legal output formats, content versions/comments, finalization dependency, and renderer prerequisites.
- [x] Traced approval creation, recipients, persistence, decisions, withdraw/revoke and associated guard gaps.
- [x] Compared current NEW routes, placeholder tabs, shared types/math, access helpers, package manifests, and roadmap scope.
- [x] Kept findings, recommendations, unresolved decisions, and deferred parity separate.
- [ ] User reviews this reference and resolves Step 0's P&L decisions before implementation starts.

No software tests are claimed for this documentation-only change. Source-derived defects should receive executable regression tests in the relevant implementation slice. No live database coverage, template visual fidelity, or deployed integration health is asserted.

### For every subsequent implementation slice

1. Re-read the relevant source anchors and this decision register; update any drift.
2. Record the approved scope/choices here and the slice status in FEATURES.
3. Present the concrete next-step plan and wait for approval.
4. Build backend and tests; update and execute Postman concurrently with API work.
5. Show real results, get the user's verification/commit authorization, then proceed to frontend.
6. Use the real API, execute an explicit frontend test checklist, and get personal user confirmation before commit.
7. Link the resulting commit/test evidence here. Never mark a future slice done on the strength of this research alone.
