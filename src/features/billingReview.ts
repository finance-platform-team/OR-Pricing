/** Tab 3 — Billing Review: procedures summary and the Billing Team's accommodation / contract / fee edits. */
import { dvPatch } from '../data/dataverse';
import { CLASS_COLORS_LIGHT, primaryIndex } from '../domain/classification';
import { S } from '../state';
import { byId, esc, findById, inputById, selectById, valueOf } from '../ui/dom';
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
import { fmt } from '../ui/format';
import { icon } from '../ui/icons';
import { setSDropValue } from '../ui/searchDropdown';
import { calculateAll } from './costing';
import { selectBillingContract } from './contracts';
import { linkLookup } from './persistence';
import { readSelectedProcedures } from './procedures';
import { completeTabs, goTab, unlockTab } from './tabs';

const REQUESTS = 'oprx_pricingrequests';
const EMPTY_ACCOM_OPTION = '<option value="">— Select Type —</option>';

const badge = (style: string, text: string) =>
  `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;${style}">${esc(text)}</span>`;

/** Fills Tab 3 from Tab 1: procedure table, accommodation, days, doctor fee, contract and specialty. */
export function populateBillingReviewTab(): void {
  const tbody = findById('billingProcTable');
  if (!tbody) return;

  renderProcedureTable(tbody);
  copyAccommodationOptions();

  if (valueOf('fAccomDays') && !valueOf('fBillingAccomDays')) inputById('fBillingAccomDays').value = valueOf('fAccomDays');
  if (valueOf('fDoctorFee') && !valueOf('fBillingDoctorFee')) inputById('fBillingDoctorFee').value = valueOf('fDoctorFee');

  // Contract (editable here)
  const contractName = valueOf('contractSearchInput');
  if (contractName && !valueOf('billingContractSearchInput')) {
    selectBillingContract({ id: valueOf('fContract'), name: contractName });
  }

  // Specialty
  const specialtyId = inputById('fSpecialty').value;
  if (specialtyId && !inputById('fBillingSpecialty').value) {
    setSDropValue('billingSpecialty', specialtyId, valueOf('specialtySearch'));
  }

  syncBillingReadOnly();
}

function renderProcedureTable(tbody: HTMLElement): void {
  const procs = readSelectedProcedures();
  if (!procs.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" style="padding:18px 14px;color:var(--text3);font-size:12px;text-align:center;">No procedures selected on this request.</td></tr>';
    return;
  }

  // Primary = the saved primary id, else the highest class (same rule as detectPrimary)
  let primarySlot = procs.find((p) => p.id === S.primaryProcedureId)?.slot;
  primarySlot ??= procs[primaryIndex(procs.map((p) => p.classType))].slot;

  tbody.innerHTML = procs
    .map((p) => {
      const isPrimary = p.slot === primarySlot;
      const clr = CLASS_COLORS_LIGHT[p.classType] || { bg: '#F3F4F6', color: '#374151' };
      const roleBadge = isPrimary
        ? badge('background:var(--brand);color:#fff;font-size:11px;font-weight:700;letter-spacing:.03em;', 'Primary')
        : badge('background:var(--surface2);color:var(--text2);border:1px solid var(--border);font-size:11px;font-weight:600;', 'Secondary');
      const classBadge = p.classType
        ? badge(`background:${clr.bg};color:${clr.color};font-size:11px;font-weight:600;`, p.classType)
        : `<span style="color:var(--text3);font-size:12px;">—</span>`;
      return `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:12px 14px;font-size:13px;font-weight:${isPrimary ? '600' : '400'};color:var(--text);">${esc(p.name || p.id)}</td>
        <td style="padding:12px 14px;">${classBadge}</td>
        <td style="padding:12px 14px;">${roleBadge}</td>
      </tr>`;
    })
    .join('');
}

/** Copies Tab 1's accommodation types (and its selection) into the Billing Review select. */
function copyAccommodationOptions(): void {
  const src = findById<HTMLSelectElement>('fAccomType');
  const dest = findById<HTMLSelectElement>('fBillingAccomType');
  if (!src || !dest) return;
  dest.innerHTML = EMPTY_ACCOM_OPTION;
  Array.from(src.options).forEach((o) => {
    if (!o.value) return;
    const opt = new Option(o.text, o.value);
    opt.dataset.name = o.dataset.name || o.text;
    dest.appendChild(opt);
  });
  if (src.value) dest.value = src.value;
}

/* ── Read-only summary ⇄ edit form ── */
const EDIT_BTN_HTML = `${icon('edit', 'width:13px;height:13px;stroke:currentColor;')} Edit`;
const DONE_BTN_HTML = `${icon('check', 'width:13px;height:13px;stroke:currentColor;')} Done`;

export function toggleBillingEdit(): void {
  const editDiv = byId('billingInfoEdit');
  const roDiv = byId('billingInfoReadOnly');
  const btn = byId('btnBillingEdit');
  const isEditing = editDiv.style.display !== 'none';
  if (isEditing) {
    syncBillingReadOnly();
    editDiv.style.display = 'none';
    roDiv.style.display = 'block';
    btn.innerHTML = EDIT_BTN_HTML;
  } else {
    editDiv.style.display = 'block';
    roDiv.style.display = 'none';
    btn.innerHTML = DONE_BTN_HTML;
  }
}

/** Puts the edit form back into read-only mode (form reset). */
export function resetBillingEditMode(): void {
  const roDiv = findById('billingInfoReadOnly');
  const editDiv = findById('billingInfoEdit');
  const btn = findById('btnBillingEdit');
  if (roDiv) roDiv.style.display = 'block';
  if (editDiv) editDiv.style.display = 'none';
  if (btn) btn.innerHTML = EDIT_BTN_HTML;
}

function syncBillingReadOnly(): void {
  byId('roContractName').textContent = valueOf('billingContractSearchInput') || '—';
  byId('roSpecialtyName').textContent = valueOf('billingSpecialtySearch') || '—';
  const acSel = findById<HTMLSelectElement>('fBillingAccomType');
  const acName = acSel?.options[acSel.selectedIndex]?.text || '—';
  byId('roAccomTypeName').textContent = acName.includes('Select') ? '—' : acName;
  byId('roAccomDays').textContent = valueOf('fBillingAccomDays') || '0';
  const docFee = parseFloat(valueOf('fBillingDoctorFee')) || 0;
  const roDocFee = findById('roDoctorFee');
  if (roDocFee) roDocFee.textContent = docFee > 0 ? `EGP ${fmt(docFee)}` : '—';
}

/** Billing Extra Fees make Remarks mandatory. */
export function onBillingExtraFeesChange(): void {
  const required = (parseFloat(inputById('fBillingExtraFees').value) || 0) > 0;
  const optSpan = findById('lblRemarksOpt');
  const reqSpan = findById('lblRemarksReq');
  if (optSpan) optSpan.style.display = required ? 'none' : 'inline';
  if (reqSpan) reqSpan.style.display = required ? 'inline' : 'none';
  if (!required) clearFieldError('fieldBillingRemarks');
}

/** Saves the review and unlocks Cost & Pricing. */
export async function completeBillingReview(): Promise<void> {
  const accomSel = selectById('fBillingAccomType');
  const accomDays = parseInt(inputById('fBillingAccomDays').value) || 0;
  const remarks = inputById('fBillingRemarks').value;
  const billingExtra = parseFloat(inputById('fBillingExtraFees').value) || 0;
  const billingDocFee = parseFloat(inputById('fBillingDoctorFee').value) || 0;

  if (!accomSel.value) {
    setFieldError('fieldBillingAccomType');
    showToast('Please select an Accommodation Type.', 'error');
    return;
  }
  clearFieldError('fieldBillingAccomType');

  if (billingExtra > 0 && !remarks.trim()) {
    setFieldError('fieldBillingRemarks');
    showToast('Remarks are required when Billing Extra Fees are entered.', 'error');
    return;
  }
  clearFieldError('fieldBillingRemarks');

  const spinner = byId('billingReviewSpinner');
  const btn = byId<HTMLButtonElement>('btnCompleteBillingReview');
  spinner.style.display = 'block';
  btn.disabled = true;
  showTabLoading(true, 'Saving billing review...');

  try {
    // Sync back to Tab 1 so the Cost tab (and calculateAll) read the reviewed values
    const srcSel = findById<HTMLSelectElement>('fAccomType');
    if (srcSel && accomSel.value) srcSel.value = accomSel.value;
    const accomDaysEl = findById<HTMLInputElement>('fAccomDays');
    if (accomDaysEl) accomDaysEl.value = accomDays > 0 ? String(accomDays) : '';
    const docFeeEl = findById<HTMLInputElement>('fDoctorFee');
    if (docFeeEl && billingDocFee >= 0) docFeeEl.value = billingDocFee ? String(billingDocFee) : '';

    if (S.recordId) {
      S.billingExtraFee = billingExtra;
      await dvPatch(REQUESTS, S.recordId, {
        oprx_accommodationdays: accomDays,
        oprx_billingremarks: remarks || null,
        oprx_billingextrafees: billingExtra > 0 ? billingExtra : null,
        oprx_extradoctorfee: billingDocFee > 0 ? billingDocFee : 0,
      });
      await saveReviewLookups(S.recordId, accomSel.value);
      console.log('[BILLING REVIEW] Saved to Dataverse');
    }

    completeTabs(3);
    unlockTab(4);
    // Recalculate now so changed fees show on Tab 4 straight away
    if (S.costsLoaded) calculateAll();
    goTab(4);
    renderAuditBanner(3, S.currentUserName, nowIso(), 'Reviewed by');
    setFooter('check', 'var(--green)', 'Billing Review complete — proceed to Cost & Pricing.');
    showToast('Billing Review saved.', 'success');
  } catch (e) {
    console.error('[BILLING REVIEW ERROR]', e);
    showToast('Save failed: ' + (errorMessage(e) || 'Unknown error'), 'error');
  } finally {
    spinner.style.display = 'none';
    btn.disabled = false;
    showTabLoading(false);
  }
}

/** Accommodation type, plus contract / specialty when the Billing Team changed them. Failures are only logged. */
async function saveReviewLookups(recordId: string, accomId: string): Promise<void> {
  const tryLink = async (navProp: string, relatedSet: string, id: string, what: string, logSuccess = false) => {
    try {
      await linkLookup(REQUESTS, recordId, navProp, relatedSet, id);
      if (logSuccess) console.log(`[BILLING REVIEW] ${what} updated:`, id);
    } catch (e) {
      console.warn(`[BILLING REVIEW] ${what} link failed:`, errorMessage(e));
    }
  };

  if (accomId) await tryLink('oprx_AccommodationTypeId', 'oprx_accommodationtypes', accomId, 'AccomType');

  const contractId = inputById('fBillingContract').value;
  if (contractId && contractId !== inputById('fContract').value) {
    await tryLink('oprx_contractid', 'oprx_contracts', contractId, 'Contract', true);
  }

  const specialtyId = inputById('fBillingSpecialty').value;
  if (specialtyId) await tryLink('oprx_Specialty', 'crd04_specialtieses', specialtyId, 'Specialty', true);
}
