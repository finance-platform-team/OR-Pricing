/** App startup: document-level listeners and the initial route. */
import { installContractPickers } from './features/contracts';
import { installFilePreviewListeners } from './features/filePreview';
import { installPatientPicker } from './features/patients';
import { initRouter, installPopstateHandler } from './features/router';
import { loadUser } from './features/user';
import { installSDropListeners } from './ui/searchDropdown';

/** Dropdown / modal / history listeners. Installed before the handler bridge so they run first. */
export function installGlobalListeners(): void {
  installFilePreviewListeners();
  installPatientPicker();
  installContractPickers();
  installSDropListeners();
  installPopstateHandler();
}

const isNumberInput = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.type === 'number';

/** Number inputs: no arrow-key / scroll-wheel stepping, no values below min. */
function installNumberInputGuards(): void {
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isNumberInput(e.target)) e.preventDefault();
  });
  document.addEventListener(
    'wheel',
    (e) => {
      if (isNumberInput(e.target)) e.target.blur();
    },
    { passive: true },
  );
  // Only inputs with a min attribute are clamped (an empty min parses to NaN)
  document.addEventListener('input', (e) => {
    if (!isNumberInput(e.target)) return;
    const min = parseFloat(e.target.min);
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val < min) e.target.value = String(min);
  });
}

export function start(): void {
  loadUser();
  installNumberInputGuards();
  initRouter();
}
