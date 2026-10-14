/** Display formatting. */

/** 12345.6 → "12,345.60" */
export function fmt(n: unknown): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "14 Oct 2026" */
export function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "14 Oct 2026 09:30" */
export function formatDateTime(value: string | number | Date): string {
  return formatDate(value) + ' ' + new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Hours as "45m", "3h 20m" or "2d 4h"; "—" when missing. */
export function formatTatHours(hrs: number | null | undefined): string {
  if (hrs == null || isNaN(hrs)) return '—';
  if (hrs < 1) return `${Math.round(hrs * 60)}m`;
  if (hrs < 24) {
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(hrs / 24);
  const h = Math.round(hrs - d * 24);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export const MS_PER_HOUR = 3_600_000;
