/**
 * Searchable dropdowns backed by preloaded option lists (specialty, the three
 * procedure slots, and the Billing Review specialty). Each one is a text input,
 * a hidden input holding the selected id, a clear button and a dropdown list.
 */
import { byId, esc, findById, highlight, inputById } from './dom';
import { clearFieldError } from './feedback';

export type SDropKey = 'specialty' | 'proc1' | 'proc2' | 'proc3' | 'billingSpecialty';

export interface SDropItem {
  id: string;
  name: string;
  /** Procedures only: class label and choice value, kept on the hidden input's dataset */
  classtype?: string;
  classtypeint?: number | '';
}

interface SDropConfig {
  search: string;
  dropdown: string;
  hidden: string;
  clear: string;
  wrap: string;
  /** Validation field cleared on select */
  field?: string;
}

const MAX_SHOWN = 15;
const PROCEDURE_KEYS: SDropKey[] = ['proc1', 'proc2', 'proc3'];

const CFG: Record<SDropKey, SDropConfig> = {
  specialty: { search: 'specialtySearch', dropdown: 'specialtyDropdown', hidden: 'fSpecialty', clear: 'specialtyClear', wrap: 'specialtyWrap', field: 'fieldSpecialty' },
  proc1: { search: 'proc1Search', dropdown: 'proc1Dropdown', hidden: 'fProc1', clear: 'proc1Clear', wrap: 'proc1Wrap', field: 'fieldProc1' },
  proc2: { search: 'proc2Search', dropdown: 'proc2Dropdown', hidden: 'fProc2', clear: 'proc2Clear', wrap: 'proc2Wrap', field: 'fieldProc2' },
  proc3: { search: 'proc3Search', dropdown: 'proc3Dropdown', hidden: 'fProc3', clear: 'proc3Clear', wrap: 'proc3Wrap', field: 'fieldProc3' },
  billingSpecialty: { search: 'billingSpecialtySearch', dropdown: 'billingSpecialtyDropdown', hidden: 'fBillingSpecialty', clear: 'billingSpecialtyClear', wrap: 'billingSpecialtyWrap' },
};
const KEYS = Object.keys(CFG) as SDropKey[];

const data: Record<SDropKey, SDropItem[]> = { specialty: [], proc1: [], proc2: [], proc3: [], billingSpecialty: [] };
const focused: Record<SDropKey, number> = { specialty: -1, proc1: -1, proc2: -1, proc3: -1, billingSpecialty: -1 };

/** Called after a dropdown's selection changes (select or clear). */
const changeListeners: Partial<Record<SDropKey, () => void>> = {};
export function onSDropChange(key: SDropKey, fn: () => void): void {
  changeListeners[key] = fn;
}

const queryOf = (key: SDropKey) => inputById(CFG[key].search).value.trim().toLowerCase();

function filtered(key: SDropKey, q: string): SDropItem[] {
  const items = data[key];
  return (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items).slice(0, MAX_SHOWN);
}

export function populateSDrop(key: SDropKey, items: SDropItem[]): void {
  data[key] = items;
}

export function getSDropItems(key: SDropKey): SDropItem[] {
  return data[key];
}

export function onSDropSearch(key: SDropKey): void {
  focused[key] = -1;
  const q = queryOf(key);
  if (!q) {
    hideSDropDropdown(key);
    return;
  }
  renderSDropDropdown(key, q);
}

/** Focus shows the matches for the current text, or everything when empty. */
export function onSDropFocus(key: SDropKey): void {
  renderSDropDropdown(key, queryOf(key));
}

function renderSDropDropdown(key: SDropKey, q: string): void {
  const dd = byId(CFG[key].dropdown);
  const all = data[key];

  // Explain why the list is empty instead of "No results"
  if (!all.length) {
    const msg = PROCEDURE_KEYS.includes(key) ? 'Select a hospital first to load procedures.' : 'No options available.';
    dd.innerHTML = `<div class="sdrop-empty">${msg}</div>`;
    dd.style.display = 'block';
    return;
  }

  const items = filtered(key, q);
  dd.innerHTML = '';
  if (!items.length) {
    dd.innerHTML = `<div class="sdrop-empty">No results${q ? ` for "${esc(q)}"` : ''}</div>`;
    dd.style.display = 'block';
    return;
  }
  if (all.length > MAX_SHOWN) {
    const hint = document.createElement('div');
    hint.className = 'sdrop-hint';
    hint.textContent =
      items.length < all.length ? `${items.length} of ${all.length} — type to narrow` : `Showing ${items.length} of ${all.length}`;
    dd.appendChild(hint);
  }
  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'sdrop-option';
    div.dataset.idx = String(idx);
    div.innerHTML = highlight(item.name, q);
    div.onclick = () => selectSDropItem(key, item);
    dd.appendChild(div);
  });
  dd.style.display = 'block';
}

function showSelected(key: SDropKey, id: string, name: string, classtype?: string, classtypeint?: number | ''): void {
  const cfg = CFG[key];
  const search = inputById(cfg.search);
  const hidden = inputById(cfg.hidden);
  search.value = name || '';
  search.style.color = 'var(--brand-dark)';
  search.style.fontWeight = '600';
  hidden.value = id;
  byId(cfg.clear).style.display = 'flex';
  if (classtype !== undefined) {
    hidden.dataset.classtype = classtype || '';
    hidden.dataset.classtypeint = String(classtypeint ?? '');
  }
}

function selectSDropItem(key: SDropKey, item: SDropItem): void {
  const cfg = CFG[key];
  showSelected(key, item.id, item.name, item.classtype, item.classtypeint);
  hideSDropDropdown(key);
  focused[key] = -1;
  changeListeners[key]?.();
  if (cfg.field) clearFieldError(cfg.field);
}

/** Shows a saved value (e.g. when loading a record) without firing change listeners. */
export function setSDropValue(key: SDropKey, id: string | null | undefined, name: string, classtype?: string, classtypeint?: number | ''): void {
  if (!id) return;
  showSelected(key, id, name, classtype, classtypeint);
}

export function clearSDropField(key: SDropKey): void {
  const cfg = CFG[key];
  const search = inputById(cfg.search);
  search.value = '';
  search.style.color = '';
  search.style.fontWeight = '';
  inputById(cfg.hidden).value = '';
  byId(cfg.clear).style.display = 'none';
  hideSDropDropdown(key);
  changeListeners[key]?.();
}

/** Clears the selection and the option list (e.g. on hospital change). */
export function clearSDrop(key: SDropKey): void {
  clearSDropField(key);
  data[key] = [];
}

function hideSDropDropdown(key: SDropKey): void {
  const dd = findById(CFG[key].dropdown);
  if (dd) dd.style.display = 'none';
}

const isOpen = (key: SDropKey) => {
  const dd = findById(CFG[key].dropdown);
  return !!dd && dd.style.display !== 'none';
};

/** Outside-click closing and arrow/enter/escape keyboard navigation. */
export function installSDropListeners(): void {
  document.addEventListener('click', (e) => {
    for (const key of KEYS) {
      const wrap = findById(CFG[key].wrap);
      if (wrap && !wrap.contains(e.target as Node)) hideSDropDropdown(key);
    }
  });

  document.addEventListener('keydown', (e) => {
    const key = KEYS.find(isOpen);
    if (!key) return;
    const opts = byId(CFG[key].dropdown).querySelectorAll('.sdrop-option');
    if (!opts.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focused[key] = Math.min(focused[key] + 1, opts.length - 1);
      opts.forEach((o, i) => o.classList.toggle('focused', i === focused[key]));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focused[key] = Math.max(focused[key] - 1, 0);
      opts.forEach((o, i) => o.classList.toggle('focused', i === focused[key]));
    } else if (e.key === 'Enter' && focused[key] >= 0) {
      e.preventDefault();
      const item = filtered(key, queryOf(key))[focused[key]];
      if (item) selectSDropItem(key, item);
    } else if (e.key === 'Escape') {
      hideSDropDropdown(key);
    }
  });
}
