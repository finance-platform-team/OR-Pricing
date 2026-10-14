/** Small typed DOM helpers. */

/** Element that must exist in index.html. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

/** Element that may be missing (optional markup). */
export function findById<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export const inputById = (id: string) => byId<HTMLInputElement>(id);
export const selectById = (id: string) => byId<HTMLSelectElement>(id);

/** Value of an optional input/select/textarea, or "" when it doesn't exist. */
export function valueOf(id: string): string {
  return findById<HTMLInputElement>(id)?.value ?? '';
}

/** Sets the value of an optional input. */
export function setValue(id: string, value: string | number): void {
  const el = findById<HTMLInputElement>(id);
  if (el) el.value = String(value);
}

export function setDisplay(id: string, display: string): void {
  const el = findById(id);
  if (el) el.style.display = display;
}

export function setText(id: string, text: string | number): void {
  const el = findById(id);
  if (el) el.textContent = String(text);
}

/** Escapes text for interpolation into innerHTML templates. */
export function esc(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Escaped text with the first case-insensitive match of `query` wrapped in <mark>. */
export function highlight(text: string, query: string): string {
  if (!query) return esc(text);
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + `<mark>${esc(text.slice(i, i + query.length))}</mark>` + esc(text.slice(i + query.length));
}

/**
 * Closes a modal overlay. When called from the overlay's own click handler
 * (with the event), only clicks on the backdrop itself close it.
 */
export function closeOverlay(id: string, event?: Event): void {
  const overlay = findById(id);
  if (event && event.target !== overlay) return;
  if (overlay) overlay.style.display = 'none';
}
