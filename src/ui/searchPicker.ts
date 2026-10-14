/**
 * Type-ahead picker over an in-memory list (patients, contracts): a text input,
 * a hidden input with the selected id, a clear button and a results dropdown.
 */
import { byId, esc, inputById } from './dom';

const MAX_RESULTS = 10;

export interface SearchPickerConfig<T> {
  input: string;
  hidden: string;
  dropdown: string;
  clearBtn: string;
  wrap: string;
  /** Noun for the "No … found" message, e.g. "patients" */
  noun: string;
  /** Font weight of the input once a value is picked */
  selectedWeight: string;
  /** Candidates to search */
  source(): T[];
  /** Whether an item matches the lower-cased query */
  matches(item: T, q: string): boolean;
  /** Option markup (escape any data!) for the given raw query */
  renderOption(item: T, query: string): string;
  idOf(item: T): string;
  /** Text shown in the input once picked */
  labelOf(item: T): string;
  /** Focusing an empty input lists the first items */
  showAllOnFocus?: boolean;
  /** Arrow / Enter / Escape navigation */
  keyboard?: boolean;
  onSelect?(item: T): void;
  onClear?(): void;
}

export interface SearchPicker<T> {
  search(query: string): void;
  focus(): void;
  select(item: T): void;
  clear(): void;
  hide(): void;
  /** Outside-click closing (+ keyboard navigation when enabled) */
  install(): void;
}

export function createSearchPicker<T>(cfg: SearchPickerConfig<T>): SearchPicker<T> {
  let results: T[] = [];
  let focusedIdx = -1;

  const hide = () => {
    byId(cfg.dropdown).style.display = 'none';
  };

  const render = (query: string) => {
    const dd = byId(cfg.dropdown);
    dd.innerHTML = '';
    if (!results.length) {
      dd.innerHTML = `<div class="no-results">No ${cfg.noun} found for "${esc(query)}"</div>`;
      dd.style.display = 'block';
      return;
    }
    const hint = document.createElement('div');
    hint.className = 'search-hint';
    hint.textContent = `${results.length} result${results.length > 1 ? 's' : ''} found`;
    dd.appendChild(hint);
    results.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'patient-option';
      div.dataset.idx = String(idx);
      div.innerHTML = cfg.renderOption(item, query);
      div.onclick = () => select(item);
      dd.appendChild(div);
    });
    dd.style.display = 'block';
  };

  const search = (query: string) => {
    focusedIdx = -1;
    if (!query || query.trim().length < 1) {
      hide();
      return;
    }
    const q = query.toLowerCase().trim();
    results = cfg.source().filter((item) => cfg.matches(item, q)).slice(0, MAX_RESULTS);
    render(query.trim());
  };

  const focus = () => {
    const q = inputById(cfg.input).value.trim();
    if (q.length > 0) search(q);
    else if (cfg.showAllOnFocus && cfg.source().length) {
      results = cfg.source().slice(0, MAX_RESULTS);
      render('');
    }
  };

  const select = (item: T) => {
    const input = inputById(cfg.input);
    inputById(cfg.hidden).value = cfg.idOf(item);
    input.value = cfg.labelOf(item);
    input.style.color = 'var(--brand-dark)';
    input.style.fontWeight = cfg.selectedWeight;
    byId(cfg.clearBtn).style.display = 'flex';
    hide();
    cfg.onSelect?.(item);
  };

  const clear = () => {
    const input = inputById(cfg.input);
    inputById(cfg.hidden).value = '';
    input.value = '';
    input.style.color = '';
    input.style.fontWeight = '';
    byId(cfg.clearBtn).style.display = 'none';
    hide();
    results = [];
    cfg.onClear?.();
  };

  const install = () => {
    document.addEventListener('click', (e) => {
      if (!document.getElementById(cfg.wrap)?.contains(e.target as Node)) hide();
    });
    if (!cfg.keyboard) return;
    document.addEventListener('keydown', (e) => {
      const dd = byId(cfg.dropdown);
      if (dd.style.display === 'none') return;
      const opts = dd.querySelectorAll('.patient-option');
      if (!opts.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusedIdx = Math.min(focusedIdx + 1, opts.length - 1);
        opts.forEach((o, i) => o.classList.toggle('focused', i === focusedIdx));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusedIdx = Math.max(focusedIdx - 1, 0);
        opts.forEach((o, i) => o.classList.toggle('focused', i === focusedIdx));
      } else if (e.key === 'Enter' && focusedIdx >= 0) {
        e.preventDefault();
        select(results[focusedIdx]);
      } else if (e.key === 'Escape') {
        hide();
      }
    });
  };

  return { search, focus, select, clear, hide, install };
}
