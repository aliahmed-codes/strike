/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
const AuthController = () => import('#controllers/auth_controller')
const ReferenceDataController = () => import('#controllers/reference_data_controller')
const QuotesController = () => import('#controllers/quotes_controller')
const QuoteCorridorsController = () => import('#controllers/quote_corridors_controller')
const SetupFeeController = () => import('#controllers/setup_fee_controller')
const QuotePnlController = () => import('#controllers/quote_pnl_controller')
const QuoteSummaryController = () => import('#controllers/quote_summary_controller')
const QuoteLegalController = () => import('#controllers/quote_legal_controller')
const QuoteFeeAnnexController = () => import('#controllers/quote_fee_annex_controller')
const QuoteApprovalsController = () => import('#controllers/quote_approvals_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router
  .group(() => {
    router.post('/login', [AuthController, 'login'])
    router.post('/logout', [AuthController, 'logout']).use(middleware.auth())
    router.get('/me', [AuthController, 'me']).use(middleware.auth())
  })
  .prefix('/auth')

router
  .group(() => {
    router.get('/regions', [ReferenceDataController, 'regions'])
    router.get('/countries', [ReferenceDataController, 'countries'])
    router.get('/currencies', [ReferenceDataController, 'currencies'])
    router.get('/use-cases', [ReferenceDataController, 'useCases'])
    router.get('/integration-types', [ReferenceDataController, 'integrationTypes'])
    router.get('/icp-nodes', [ReferenceDataController, 'icpNodes'])
    router.get('/corridors', [ReferenceDataController, 'corridors'])
    router.get('/corridors/facets', [ReferenceDataController, 'corridorFacets'])
    router.get('/corridors/matching', [ReferenceDataController, 'matchingCorridors'])
  })
  .prefix('/reference')
  .use(middleware.auth())

router
  .group(() => {
    router.get('/', [QuotesController, 'index'])
    router.post('/', [QuotesController, 'store'])
    router.get('/:id', [QuotesController, 'show'])
    router.patch('/:id', [QuotesController, 'update'])
    router.delete('/:id', [QuotesController, 'destroy'])

    router.post('/:quoteId/corridors', [QuoteCorridorsController, 'store'])
    router.patch('/:quoteId/corridors/:id', [QuoteCorridorsController, 'update'])
    router.delete('/:quoteId/corridors/:id', [QuoteCorridorsController, 'destroy'])
    router.post('/:quoteId/corridors/bulk-delete', [QuoteCorridorsController, 'bulkDelete'])
    router.post('/:quoteId/corridors/bulk-restore', [QuoteCorridorsController, 'bulkRestore'])
    router.get('/:quoteId/corridors/deleted', [QuoteCorridorsController, 'listDeleted'])

    router.get('/:quoteId/setup-fee', [SetupFeeController, 'show'])
    router.put('/:quoteId/setup-fee', [SetupFeeController, 'update'])

    router.get('/:quoteId/pnl', [QuotePnlController, 'show'])
    router.put('/:quoteId/pnl', [QuotePnlController, 'update'])

    router.get('/:quoteId/summary', [QuoteSummaryController, 'show'])

    router.get('/:quoteId/legal', [QuoteLegalController, 'show'])
    router.get('/:quoteId/documents/legal-contract', [QuoteLegalController, 'downloadContract'])

    router.get('/:quoteId/fee-annex', [QuoteFeeAnnexController, 'show'])
    router.get('/:quoteId/fee-annex/versions', [QuoteFeeAnnexController, 'versions'])
    router.put('/:quoteId/fee-annex', [QuoteFeeAnnexController, 'save'])
    router.post('/:quoteId/fee-annex/fill', [QuoteFeeAnnexController, 'fill'])
    router.post('/:quoteId/fee-annex/import', [QuoteFeeAnnexController, 'importFile'])
    router.get('/:quoteId/fee-annex/pdf', [QuoteFeeAnnexController, 'downloadPdf'])
    router.get('/:quoteId/fee-annex/docx', [QuoteFeeAnnexController, 'downloadDocx'])

    router.get('/:quoteId/approvals', [QuoteApprovalsController, 'index'])
    router.get('/:quoteId/approvals/preview', [QuoteApprovalsController, 'preview'])
    router.post('/:quoteId/approvals', [QuoteApprovalsController, 'submit'])
    router.post('/:quoteId/approvals/:approvalId/decide', [QuoteApprovalsController, 'decide'])
    router.post('/:quoteId/approvals/withdraw', [QuoteApprovalsController, 'withdraw'])
  })
  .prefix('/quotes')
  .use(middleware.auth())
