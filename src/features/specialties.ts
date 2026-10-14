/** Specialty options (Tab 1 + Billing Review), filtered by the hospital's specialty tag. */
import { dvList } from '../data/dataverse';
import type { SpecialtyRow } from '../data/rows';
import { findById } from '../ui/dom';
import { populateSDrop } from '../ui/searchDropdown';

/** No tag (no hospital picked) disables the specialty picker and clears its options. */
export async function loadSpecialties(tag?: string | null): Promise<void> {
  const input = findById<HTMLInputElement>('specialtySearch');
  const setInput = (disabled: boolean, placeholder: string) => {
    if (!input) return;
    input.disabled = disabled;
    input.placeholder = placeholder;
  };

  if (!tag) {
    setInput(true, 'Select a hospital first...');
    populateSDrop('specialty', []);
    populateSDrop('billingSpecialty', []);
    return;
  }

  setInput(true, 'Loading...');
  try {
    const rows = await dvList<SpecialtyRow>(
      `crd04_specialtieses?$select=crd04_specialtiesid,crd04_title&$filter=statecode eq 0 and cr18c_tag eq '${tag}'&$orderby=crd04_title asc`,
    );
    const items = rows.map((sp) => ({ id: sp.crd04_specialtiesid, name: sp.crd04_title }));
    populateSDrop('specialty', items);
    populateSDrop('billingSpecialty', items);
    setInput(false, `Search ${items.length} specialt${items.length === 1 ? 'y' : 'ies'}...`);
    console.log(`[LOAD] ${items.length} specialties loaded (tag=${tag})`);
  } catch (e) {
    console.warn('[LOAD] Specialties failed:', e);
    setInput(false, 'Search specialty...');
  }
}
