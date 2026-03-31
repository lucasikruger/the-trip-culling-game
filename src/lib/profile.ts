export const MAX_DISPLAY_NAME_LENGTH = 20;

export function getDefaultDisplayName(email: string | null | undefined): string {
  const normalizedEmail = String(email ?? '').trim();
  const localPart = normalizedEmail.split('@')[0] ?? normalizedEmail;
  return localPart.slice(0, MAX_DISPLAY_NAME_LENGTH);
}

function sanitizeDisplayName(value: FormDataEntryValue | string | null | undefined): string {
  const name = String(value ?? '').trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  const lowerName = name.toLowerCase();

  if (!name) return '';
  if (lowerName.includes('blob:')) return '';
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/|data:|file:|blob:)/i.test(name)) return '';

  return name;
}

export function getSafeDisplayName(value: FormDataEntryValue | string | null | undefined, email: string): string {
  return sanitizeDisplayName(value) || getDefaultDisplayName(email);
}

export function normalizeDisplayName(value: FormDataEntryValue | string | null | undefined, email: string): string {
  return getSafeDisplayName(value, email);
}
