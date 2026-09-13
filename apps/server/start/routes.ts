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

    router.get('/:quoteId/setup-fee', [SetupFeeController, 'show'])
    router.put('/:quoteId/setup-fee', [SetupFeeController, 'update'])
  })
  .prefix('/quotes')
  .use(middleware.auth())
