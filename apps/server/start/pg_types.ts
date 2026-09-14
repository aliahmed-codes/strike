import { types } from 'pg'

/**
 * node-postgres returns NUMERIC/DECIMAL columns (OID 1700) as strings by
 * default, to avoid silent precision loss on values too large for a JS
 * number. Every money/percentage column in this app uses `decimal` and is
 * modeled as `number` in both Lucid models and the shared frontend types —
 * without this, any value read back with a fresh SELECT (as opposed to the
 * in-memory value right after `.create()`) comes back as a string like
 * "37500.00", which crashes any `.toFixed()`/`.toLocaleString()` call on it.
 * Our amounts are well within safe-float range, so parsing as a number here
 * is the right trade-off.
 */
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value))
