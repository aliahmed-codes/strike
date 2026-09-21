import { isAxiosError } from 'axios'

/** Downloads an in-memory file, releasing the object URL straight after. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Reads the filename from a Content-Disposition header, preferring the UTF-8 form. */
export function fileNameFromDisposition(header: string | undefined, fallback: string): string {
  if (!header) return fallback
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      // fall through to the plain filename
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1] : fallback
}

/**
 * A request made with responseType 'blob' delivers even a JSON error body as
 * a Blob, which hides the server's real message. This puts the parsed JSON
 * back on the error so getApiErrorMessage and blockers reads work as usual.
 */
export async function unwrapBlobError(error: unknown): Promise<unknown> {
  if (isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await error.response.data.text())
    } catch {
      // not JSON — leave the generic message
    }
  }
  return error
}
