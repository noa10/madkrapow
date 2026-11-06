/**
 * Only allow same-origin relative redirect paths.
 *
 * The URL-parsing origin check is what makes this hold: WHATWG URL parsing
 * treats a backslash as a slash for special schemes, so '/\evil.com' parses
 * against a foreign origin and is rejected here — the weaker '//' and
 * leading-backslash checks alone let it through.
 */
export function isValidRedirect(redirect: string | null): redirect is string {
  if (!redirect || !redirect.startsWith('/')) return false
  if (redirect.startsWith('//') || redirect.startsWith('\\')) return false
  try {
    const url = new URL(redirect, 'http://localhost')
    if (url.host !== 'localhost') return false
  } catch {
    return false
  }
  return true
}
