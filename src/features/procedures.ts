/** The three procedure slots on Tab 1 and primary-procedure detection. */
import type { ProcedureRow } from '../data/rows';
import { CLASS_COLORS, getClassLabel, primaryIndex } from '../domain/classification';
import { S } from '../state';
import type { SelectedProcedure } from '../types';
import { byId, findById, inputById } from '../ui/dom';
import { clearSDrop, onSDropChange, populateSDrop, setSDropValue, type SDropKey } from '../ui/searchDropdown';

const SLOTS = [1, 2, 3] as const;
const slotKey = (slot: 1 | 2 | 3) => `proc${slot}` as SDropKey;

for (const slot of SLOTS) onSDropChange(slotKey(slot), () => detectPrimary());

/** Procedures currently picked, in slot order. */
export function readSelectedProcedures(): SelectedProcedure[] {
  const out: SelectedProcedure[] = [];
  for (const slot of SLOTS) {
    const hidden = findById<HTMLInputElement>(`fProc${slot}`);
    if (!hidden?.value) continue;
    out.push({
      slot,
      id: hidden.value,
      name: findById<HTMLInputElement>(`proc${slot}Search`)?.value?.trim() || '',
      classType: hidden.dataset?.classtype || '',
    });
  }
  return out;
}

export function populateProcedureDropdowns(procedures: ProcedureRow[]): void {
  const items = procedures.map((p) => ({
    id: p.oprx_procedureid,
    name: p.oprx_procedurename,
    classtype: getClassLabel(p.oprx_classtype),
    classtypeint: p.oprx_classtype ?? ('' as const),
  }));
  SLOTS.forEach((slot) => populateSDrop(slotKey(slot), items));
  detectPrimary();
  console.log(`[PROC] ${items.length} procedure(s) loaded into SDROP`);
}

export function resetProcedureDropdowns(): void {
  SLOTS.forEach((slot) => clearSDrop(slotKey(slot)));
  detectPrimary();
}

/** Shows the procedures saved on a record (ids from _oprx_procedureNid_value). */
export function restoreProcedureSelections(procedures: ProcedureRow[], savedIds: (string | null | undefined)[]): void {
  SLOTS.forEach((slot, i) => {
    const id = savedIds[i];
    if (!id) return;
    const p = procedures.find((x) => x.oprx_procedureid === id);
    if (p) setSDropValue(slotKey(slot), p.oprx_procedureid, p.oprx_procedurename, getClassLabel(p.oprx_classtype), p.oprx_classtype ?? '');
  });
}

/**
 * Marks the highest-class procedure as Primary (the rest Secondary), shows
 * class badges on each slot and stores the primary id in S.primaryProcedureId.
 */
export function detectPrimary(): void {
  const procs = readSelectedProcedures();
  const alert = byId('primaryAlert');

  if (!procs.length) {
    SLOTS.forEach((slot) => {
      byId(`procBadge${slot}`).style.display = 'none';
      byId(`procClass${slot}`).style.display = 'none';
      byId(`procCard${slot}`).classList.remove('has-value', 'is-primary');
    });
    alert.style.display = 'none';
    return;
  }

  const primary = procs[primaryIndex(procs.map((p) => p.classType))];
  SLOTS.forEach((slot) => {
    const hidden = inputById(`fProc${slot}`);
    const badge = byId(`procBadge${slot}`);
    const classDiv = byId(`procClass${slot}`);
    const card = byId(`procCard${slot}`);
    if (!hidden.value) {
      badge.style.display = 'none';
      classDiv.style.display = 'none';
      card.classList.remove('has-value', 'is-primary');
      return;
    }
    const ct = hidden.dataset.classtype || '';
    card.classList.add('has-value');
    badge.style.display = 'inline-block';
    classDiv.style.display = 'inline-block';
    if (slot === primary.slot) {
      badge.className = 'primary-badge';
      badge.textContent = 'Primary';
      card.classList.add('is-primary');
    } else {
      badge.className = 'secondary-badge';
      badge.textContent = 'Secondary';
      card.classList.remove('is-primary');
    }
    const clr = CLASS_COLORS[ct] || CLASS_COLORS['Minor'];
    classDiv.style.background = clr.bg;
    classDiv.style.color = clr.color;
    classDiv.style.fontWeight = '600';
    classDiv.textContent = ct;
  });
  alert.style.display = 'flex';
  byId('primaryAlertText').textContent = `Primary: "${primary.name}" (${primary.classType}) — highest classification auto-selected.`;

  S.primaryProcedureId = primary.id;
  console.log(`[PRIMARY] Set: ${primary.name} (${primary.classType}) → ${primary.id}`);
}
