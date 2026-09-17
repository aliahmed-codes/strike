import { isAxiosError } from 'axios'

/**
 * AdonisJS returns either { message } (e.g. 401/409) or
 * { errors: [{ message, field }] } (422 validation failures).
 */
export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; errors?: { message: string }[] }
      | undefined

    if (data?.errors?.length) {
      return data.errors.map((e) => e.message).join(', ')
    }
    if (data?.message) {
      return data.message
    }
  }

  return 'Something went wrong. Please try again.'
}

/**
 * The 422 schema-violation shape only ({ errors: [{ field, message }] }) —
 * `null` for anything else (a business-rule rejection like tier allocation,
 * which has no single field to attribute the message to, or a non-validation
 * error), so callers can tell "which field failed" apart from "show this
 * message generally."
 */
export function getApiFieldErrors(error: unknown): { field: string; message: string }[] | null {
  if (!isAxiosError(error)) return null
  const data = error.response?.data as { errors?: { message: string; field: string }[] } | undefined
  return data?.errors?.length ? data.errors : null
}
