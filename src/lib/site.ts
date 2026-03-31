/**
 * Returns the canonical site URL from the SITE_URL env var.
 * Never has a trailing slash.
 * Falls back to localhost for local development.
 */
export function getSiteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:4321').replace(/\/$/, '');
}
