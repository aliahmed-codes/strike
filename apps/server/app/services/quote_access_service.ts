import type User from '#models/user'
import type Quote from '#models/quote'

/** Admins can see/edit every quote; everyone else only their own. */
export function canAccessQuote(user: User, quote: Quote): boolean {
  return user.role === 'admin' || quote.ownerId === user.id
}

/** Draft, and rejected so a quote can be fixed and resubmitted — everything else (submitted/approved/closed) is frozen. */
export function isQuoteEditable(quote: Pick<Quote, 'status'>): boolean {
  return quote.status === 'draft' || quote.status === 'rejected'
}
