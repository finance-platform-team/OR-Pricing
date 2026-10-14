/** Tab 1 — Request info: patient, hospital, contract, specialty, procedures, consumables, files. */
import { MAX_FILE_BYTES } from '../config';
import type { AccommodationTypeRow } from '../data/rows';
import { fetchHospitalData } from '../data/hospitalData';
import { getSpecialtyTagForHospital } from '../domain/hospital';
import { Status } from '../domain/status';
import { S } from '../state';
import { byId, inputById, selectById } from '../ui/dom';
import {
  clearFieldError,
  errorMessage,
  nowIso,
  renderAuditBanner,
  setFieldError,
  setFooter,
  showTabLoading,
  showToast,
} from '../ui/feedback';
import { clearSDropField } from '../ui/searchDropdown';
import { clearContract } from './contracts';
import { currentHospital, saveRequestRecord, uploadFiles } from './persistence';
import { populateProcedureDropdowns, resetProcedureDropdowns } from './procedures';
import { loadSpecialties } from './specialties';
import { createEmptySupplyChainRecord } from './supplyChain';
import { completeTabs, goTab, unlockTab } from './tabs';

export const EMPTY_ACCOM_OPTION = '<option value="">— Select Type —</option>';

export function fillAccommodationOptions(select: HTMLSelectElement, rows: AccommodationTypeRow[]): void {
  rows.forEach((a) => {
    const o = new Option(a.oprx_typename, a.oprx_accommodationtypeid);
    o.dataset.name = a.oprx_typename;
    select.appendChild(o);
  });
}

/** Reloads contracts, accommodation types, procedures and specialties for the picked hospital. */
export async function onHospitalChange(): Promise<void> {
  clearFieldError('fieldHospital');

  const hospital = currentHospital();
  const searchInput = inputById('contractSearchInput');
  const accomSel = selectById('fAccomType');

  clearContract();
  accomSel.innerHTML = EMPTY_ACCOM_OPTION;
  accomSel.disabled = true;

  if (!hospital) {
    searchInput.disabled = true;
    searchInput.placeholder = 'Select a hospital first...';
    S.contractsCache = [];
    loadSpecialties(null);
    console.log('[HOSPITAL] No hospital selected');
    return;
  }

  searchInput.disabled = true;
  searchInput.placeholder = 'Loading...';
  S.contractsCache = [];
  resetProcedureDropdowns();
  clearSDropField('specialty');
  clearSDropField('billingSpecialty');
  loadSpecialties(getSpecialtyTagForHospital(hospital));

  try {
    const data = await fetchHospitalData(hospital);
    S.contractsCache = data.contracts.map((c) => ({ id: c.oprx_contractid, name: c.oprx_contractname }));
    searchInput.disabled = false;
    searchInput.placeholder = `Search ${S.contractsCache.length} contract(s)...`;
    fillAccommodationOptions(accomSel, data.accommodationTypes);
    accomSel.disabled = false;
    populateProcedureDropdowns(data.procedures);
    console.log(
      `[HOSPITAL] Loaded ${S.contractsCache.length} contracts + ${data.accommodationTypes.length} accom types + ${data.procedures.length} procedures for hospital=${hospital}`,
    );
  } catch (e) {
    console.error('[HOSPITAL] Failed to load data:', e);
    S.contractsCache = [];
    searchInput.disabled = true;
    searchInput.placeholder = 'Failed to load contracts';
    accomSel.disabled = true;
    populateProcedureDropdowns([]);
    showToast('Could not load contracts and procedures for this hospital. Please refresh or contact support.', 'error');
  }
}

/** Shows / hides the Supply Chain tab and the consumables description. */
export function setHasConsumables(has: boolean): void {
  S.hasConsumables = has;
  byId('consumablesDescBox').style.display = has ? 'block' : 'none';
  byId('tabBtn2').classList.toggle('hidden', !has);
  byId('tab1NextLabel').textContent = has ? 'Supply Chain' : 'Billing Review';
}

export function onConsumablesToggle(): void {
  setHasConsumables(inputById('fExtConsumables').checked);
}

const REQUIRED_FIELDS: [fieldId: string, inputId: string][] = [
  ['fieldHospital', 'fHospital'],
  ['fieldContract', 'fContract'],
  ['fieldSpecialty', 'fSpecialty'],
  ['fieldAccomType', 'fAccomType'],
  ['fieldMainOp', 'fMainOp'],
  ['fieldProc1', 'fProc1'],
];

function validateTab1(): boolean {
  let valid = true;
  const check = (fieldId: string, ok: boolean) => {
    if (ok) clearFieldError(fieldId);
    else {
      setFieldError(fieldId);
      valid = false;
    }
  };

  check('fieldPatient', !!inputById('fPatient').value);
  for (const [fieldId, inputId] of REQUIRED_FIELDS) {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    check(fieldId, !!el?.value.trim());
  }
  // Description is required when external consumables are needed
  if (inputById('fExtConsumables').checked) check('fieldConsumablesDesc', !!inputById('fConsumablesDesc').value.trim());

  // Files are optional, but not over the size limit
  clearFieldError('fieldInsurance');
  clearFieldError('fieldReferral');
  if ((inputById('fInsuranceCard').files?.[0]?.size ?? 0) > MAX_FILE_BYTES) {
    setFieldError('fieldInsurance');
    valid = false;
    showToast('Insurance card exceeds 32 MB limit.', 'error');
  }
  if ((inputById('fReferral').files?.[0]?.size ?? 0) > MAX_FILE_BYTES) {
    setFieldError('fieldReferral');
    valid = false;
    showToast('OR Referral exceeds 32 MB limit.', 'error');
  }

  if (!valid) showToast('Please fill all required fields.', 'error');
  return valid;
}

/** Saves the request (→ Pending Supply Chain or Pending Billing) and moves on. */
export async function completeTab1(): Promise<void> {
  if (!validateTab1()) return;
  showTabLoading(true, 'Saving request...');
  try {
    await saveRequestRecord(S.hasConsumables ? Status.PendingSupplyChain : Status.PendingBilling);
    await uploadFiles();
    if (S.hasConsumables && S.recordId) await createEmptySupplyChainRecord();

    completeTabs(1);
    renderAuditBanner(1, S.currentUserName, nowIso(), 'Submitted by');
    const next = S.hasConsumables ? 2 : 3;
    unlockTab(next);
    goTab(next);
    setFooter(
      'check',
      'var(--green)',
      `Request saved — ${S.hasConsumables ? 'enter consumables in Supply Chain.' : 'proceed to Billing Review.'}`,
    );
    showToast('Request info saved successfully.', 'success');
  } catch (e) {
    console.error('Save request failed:', e);
    showToast('Save failed: ' + (errorMessage(e) || 'Unknown error'), 'error');
  } finally {
    showTabLoading(false);
  }
}
