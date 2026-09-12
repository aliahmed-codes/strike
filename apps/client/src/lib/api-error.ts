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
