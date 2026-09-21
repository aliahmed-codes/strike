/**
 * Content-Disposition for a download: an ASCII fallback plus the UTF-8 form, so a
 * quote name with quotes, slashes or accents can never break or inject into the header.
 */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, "'")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
