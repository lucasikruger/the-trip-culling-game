export function parseDateTimeLocalToIso(value: string | null | undefined, timezoneOffsetMinutesRaw?: string | null): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const [, year, month, day, hour, minute] = match;
  const timezoneOffsetMinutes = Number(timezoneOffsetMinutesRaw);
  const baseUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  const date = Number.isFinite(timezoneOffsetMinutes)
    ? new Date(baseUtcMs + timezoneOffsetMinutes * 60_000)
    : new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
