/** Patient search on Tab 1 (over a cached list of active patients). */
import { PATIENTS_TOP } from '../config';
import { dvList } from '../data/dataverse';
import type { PatientRow } from '../data/rows';
import { S } from '../state';
import type { Patient } from '../types';
import { byId, esc, highlight } from '../ui/dom';
import { clearFieldError, showToast } from '../ui/feedback';
import { createSearchPicker } from '../ui/searchPicker';

type PatientEntry = [id: string, patient: Patient];

export function toPatient(p: Partial<PatientRow>): Patient {
  return {
    name: p.opd_patientname || '—',
    code: p.opd_patientcode || '—',
    bu: p.opd_patientbu || p.opd_butext || '—',
    age: p.opd_age != null ? p.opd_age + ' yrs' : '—',
    gender: p.opd_gendertext || '—',
    address: p.opd_address || '—',
  };
}

/** Loads active patients into S.patientsCache for the search box. */
export async function loadPatients(): Promise<void> {
  try {
    const rows = await dvList<PatientRow>(
      'opd_patients?$select=opd_patientid,opd_patientname,opd_patientcode,opd_patientbu,opd_age,opd_gendertext,opd_address,opd_butext' +
        `&$filter=statecode eq 0&$orderby=opd_patientname asc&$top=${PATIENTS_TOP}`,
    );
    S.patientsCache = {};
    rows.forEach((p) => {
      S.patientsCache[p.opd_patientid] = toPatient(p);
    });
  } catch (e) {
    console.error('[LOAD] Patients failed:', e);
    S.patientsCache = {};
    showToast('Could not load patients. Please refresh or contact support.', 'error');
  }
}

const INFO_FIELDS: [elementId: string, key: keyof Patient][] = [
  ['fPatientName', 'name'],
  ['fPatientCode', 'code'],
  ['fPatientBU', 'bu'],
  ['fPatientAge', 'age'],
  ['fPatientGender', 'gender'],
  ['fPatientAddress', 'address'],
];

const picker = createSearchPicker<PatientEntry>({
  input: 'patientSearchInput',
  hidden: 'fPatient',
  dropdown: 'patientDropdown',
  clearBtn: 'patientClearBtn',
  wrap: 'patientSearchWrap',
  noun: 'patients',
  selectedWeight: '500',
  keyboard: true,
  source: () => Object.entries(S.patientsCache),
  matches: ([, p], q) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.bu.toLowerCase().includes(q),
  renderOption: ([, p], q) => `
      <div class="patient-option-name">${highlight(p.name, q)}</div>
      <div class="patient-option-meta">${highlight(p.code, q)} · ${esc(p.bu)} · ${esc(p.age)} · ${esc(p.gender)}</div>`,
  idOf: ([id]) => id,
  labelOf: ([, p]) => `${p.code} — ${p.name}`,
  onSelect: ([, p]) => {
    for (const [elId, key] of INFO_FIELDS) byId(elId).textContent = p[key];
    byId('patientInfoCard').style.display = 'grid';
    S.patientData = p;
    clearFieldError('fieldPatient');
  },
  onClear: () => {
    byId('patientInfoCard').style.display = 'none';
    S.patientData = null;
  },
});

export const onPatientSearch = (query: string) => picker.search(query);
export const showPatientDropdown = () => picker.focus();
export const clearPatient = () => picker.clear();
export const installPatientPicker = () => picker.install();

/** Shows a saved patient (record load). */
export function selectPatient(id: string, patient: Patient): void {
  picker.select([id, patient]);
}
