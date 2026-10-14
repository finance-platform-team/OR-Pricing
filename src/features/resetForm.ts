/** Clears the request form (state + DOM) before a new or another request is opened. */
import { resetState, S } from '../state';
import { byId, findById, inputById, selectById, setDisplay, setText, setValue } from '../ui/dom';
import { clearFieldError, setFooter, updateStatus } from '../ui/feedback';
import { clearSDropField, type SDropKey } from '../ui/searchDropdown';
import { resetApprovalDecisionArea } from './approval';
import { resetBillingEditMode } from './billingReview';
import { clearBillingContract, clearContract } from './contracts';
import { clearPatient } from './patients';
import { resetProcedureDropdowns } from './procedures';
import { EMPTY_ACCOM_OPTION } from './requestInfo';
import { addConsumableItem } from './supplyChain';

export function resetForm(): void {
  resetState();
  resetFormFields();
}

function resetFormFields(): void {
  // Audit banners
  for (let n = 1; n <= 5; n++) {
    const b = findById(`auditBanner${n}`);
    if (b) {
      b.innerHTML = '';
      b.style.display = 'none';
    }
  }
  // Header buttons and popups
  for (const id of ['viewOrReplyBtn', 'scQueryPendingBtn', 'scQueryModalOverlay', 'scAskModalOverlay', 'auditTrailBtn', 'auditTrailModalOverlay']) {
    setDisplay(id, 'none');
  }

  resetRequestInfo();
  resetTabs();
  resetBillingReview();
  resetCostAndApproval();

  // Consumables — a new request starts with one empty item
  S.consumableItems = [];
  byId('consumablesList').innerHTML = '';
  addConsumableItem();

  updateStatus('Draft');
  byId('reqId').textContent = 'REQ-NEW';
  setFooter('info', 'var(--text3)', 'Complete all required fields to proceed.');

  // Files
  byId('insuranceFileStatus').style.display = 'none';
  byId('insuranceFileName').textContent = '';
  byId('referralFileStatus').style.display = 'none';
  byId('referralFileName').textContent = '';

  document.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
}

function resetRequestInfo(): void {
  clearPatient();
  selectById('fHospital').value = '';
  clearContract();
  const contractInput = inputById('contractSearchInput');
  contractInput.disabled = true;
  contractInput.placeholder = 'Select a hospital first...';
  S.contractsCache = [];

  const accomSel = selectById('fAccomType');
  accomSel.innerHTML = EMPTY_ACCOM_OPTION;
  accomSel.disabled = true;
  for (const id of ['fAccomDays', 'fDoctorFee', 'fSpecialty', 'fMainOp', 'fConsumablesDesc']) inputById(id).value = '';
  (['specialty', 'proc1', 'proc2', 'proc3', 'billingSpecialty'] as SDropKey[]).forEach(clearSDropField);
  resetProcedureDropdowns();

  inputById('fExtConsumables').checked = false;
  byId('consumablesDescBox').style.display = 'none';
  byId('tab1NextLabel').textContent = 'Billing Review';
}

function resetTabs(): void {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('done', 'active', 'locked', 'rejected'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active', 'tab-frozen'));
  byId('tabBtn1').classList.add('active');
  byId('tabBtn2').classList.add('locked', 'hidden');
  for (const n of [3, 4, 5]) byId(`tabBtn${n}`).classList.add('locked');
  byId('tabPanel1').classList.add('active');
  S.unlockedTabs = [1];
  S.currentTab = 1;
}

function resetBillingReview(): void {
  byId('billingProcTable').innerHTML =
    '<tr><td colspan="3" style="padding:18px 14px;color:var(--text3);font-size:12px;text-align:center;">No procedures loaded.</td></tr>';
  const billingAccomSel = findById('fBillingAccomType');
  if (billingAccomSel) billingAccomSel.innerHTML = EMPTY_ACCOM_OPTION;
  for (const id of ['fBillingAccomDays', 'fBillingDoctorFee', 'fBillingRemarks', 'fBillingExtraFees']) setValue(id, '');

  // Remarks back to optional
  setDisplay('lblRemarksOpt', 'inline');
  setDisplay('lblRemarksReq', 'none');
  clearFieldError('fieldBillingRemarks');
  clearFieldError('fieldBillingExtraFees');

  resetBillingEditMode();
  for (const id of ['roContractName', 'roSpecialtyName', 'roAccomTypeName', 'roDoctorFee']) setText(id, '—');
  setText('roAccomDays', '0');
  clearBillingContract();
}

function resetCostAndApproval(): void {
  byId('costBreakdownContainer').style.display = 'none';
  byId('costFetchAlert').style.display = 'block';
  byId<HTMLButtonElement>('btnSubmitToApproval').disabled = true;
  byId('approvalPending').style.display = 'block';
  byId('approvalReady').style.display = 'none';
  resetApprovalDecisionArea();
}
