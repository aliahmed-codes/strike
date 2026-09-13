import type User from '#models/user'
import type Quote from '#models/quote'

/** Admins can see/edit every quote; everyone else only their own. */
export function canAccessQuote(user: User, quote: Quote): boolean {
  return user.role === 'admin' || quote.ownerId === user.id
}
