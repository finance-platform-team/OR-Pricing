/** Opens a saved request and lands on the tab its status calls for. */
import { dvGet } from '../data/dataverse';
import { fetchHospitalData } from '../data/hospitalData';
import type { PricingRequestRow } from '../data/rows';
import { getSpecialtyTagForHospital } from '../domain/hospital';
import { getStatusLabel, Status } from '../domain/status';
import { S } from '../state';
import { byId, findById, inputById, selectById } from '../ui/dom';
import { errorMessage, renderAuditBanner, showToast, updateCharCounter, updateStatus } from '../ui/feedback';
import { getSDropItems, setSDropValue } from '../ui/searchDropdown';
import { loadApprovalLog, renderApproved, renderRejected } from './approval';
import { updateAuditTrailButtonVisibility } from './auditTrail';
import { onBillingExtraFeesChange } from './billingReview';
import { approvalBreakdownText, loadPricingOutput, loadProcedureCosts, showApprovalReady } from './costing';
import { selectContract } from './contracts';
import { showOrQueryBanner, showResolvedQueryBanner } from './orQuery';
import { selectPatient, toPatient } from './patients';
import { detectPrimary, populateProcedureDropdowns, restoreProcedureSelections } from './procedures';
import { EMPTY_ACCOM_OPTION, fillAccommodationOptions, setHasConsumables } from './requestInfo';
import { loadSpecialties } from './specialties';
import { loadConsumableItems } from './supplyChain';
import { completeTabs, goTab, markTabRejected, unfreezeTab, unlockTab } from './tabs';

const SELECT =
  'oprx_requestname,oprx_status,oprx_mainoperationname,oprx_extconsumables,oprx_consumablesdesc,oprx_extradoctorfee,' +
  'oprx_accommodationdays,oprx_hospital,oprx_insurancecard_name,oprx_orreferral_name,oprx_billingremarks,oprx_billingextrafees,' +
  '_oprx_patientid_value,_oprx_contractid_value,_oprx_accommodationtypeid_value,_oprx_specialty_value,' +
  '_oprx_procedure1id_value,_oprx_procedure2id_value,_oprx_procedure3id_value,_oprx_primaryprocedureid_value,createdon,modifiedon';
const EXPAND =
  'oprx_patientid($select=opd_patientname,opd_patientcode,opd_patientbu,opd_age,opd_gendertext,opd_address),' +
  'createdby($select=fullname),modifiedby($select=fullname)';

export async function loadExistingRecord(recordId: string): Promise<void> {
  try {
    console.log(`[LOAD] Loading existing record: ${recordId}`);
    S.recordId = recordId;
    updateAuditTrailButtonVisibility();

    const rec = await dvGet<PricingRequestRow>(`oprx_pricingrequests(${recordId})?$select=${SELECT}&$expand=${EXPAND}`);

    const reqName = rec.oprx_requestname || '—';
    byId('reqId').textContent = reqName;
    const statusLabel = getStatusLabel(rec.oprx_status);
    updateStatus(statusLabel);

    if (rec.oprx_patientid && rec._oprx_patientid_value) {
      selectPatient(rec._oprx_patientid_value, toPatient(rec.oprx_patientid));
    }

    const hospital = rec.oprx_hospital != null ? String(rec.oprx_hospital) : '';
    if (hospital) selectById('fHospital').value = hospital;
    loadSpecialties(getSpecialtyTagForHospital(hospital));
    if (hospital) await loadHospitalSelections(rec, hospital);

    fillRequestFields(rec);
    await loadConsumableItems(recordId);
    showSavedFiles(rec);

    await openTabForStatus(rec, statusLabel);
    console.log(`[LOAD] Record loaded: ${reqName} — Status: ${statusLabel}`);
  } catch (e) {
    console.error('[LOAD ERROR]', e);
    showToast('Failed to load record: ' + errorMessage(e), 'error');
  }
}

/** Contracts, accommodation types and procedures for the hospital, with the record's saved picks. */
async function loadHospitalSelections(rec: PricingRequestRow, hospital: string): Promise<void> {
  const searchInput = inputById('contractSearchInput');
  const accomSel = selectById('fAccomType');
  searchInput.disabled = true;
  searchInput.placeholder = 'Loading...';
  accomSel.innerHTML = EMPTY_ACCOM_OPTION;
  accomSel.disabled = true;
  try {
    const data = await fetchHospitalData(hospital);

    S.contractsCache = data.contracts.map((c) => ({ id: c.oprx_contractid, name: c.oprx_contractname }));
    if (rec._oprx_contractid_value) {
      const saved = S.contractsCache.find((c) => c.id === rec._oprx_contractid_value);
      if (saved) selectContract(saved);
      else inputById('fContract').value = rec._oprx_contractid_value;
    }
    searchInput.disabled = false;
    searchInput.placeholder = `Search ${S.contractsCache.length} contract(s)...`;

    fillAccommodationOptions(accomSel, data.accommodationTypes);
    accomSel.disabled = false;
    if (rec._oprx_accommodationtypeid_value) accomSel.value = rec._oprx_accommodationtypeid_value;

    populateProcedureDropdowns(data.procedures);
    restoreProcedureSelections(data.procedures, [rec._oprx_procedure1id_value, rec._oprx_procedure2id_value, rec._oprx_procedure3id_value]);
    if (rec._oprx_primaryprocedureid_value) S.primaryProcedureId = rec._oprx_primaryprocedureid_value;
    detectPrimary();

    console.log(
      `[LOAD] ${S.contractsCache.length} contracts + ${data.accommodationTypes.length} accom types + ${data.procedures.length} procedures loaded`,
    );
  } catch (e) {
    console.warn('[LOAD] Hospital data fetch failed:', e);
    searchInput.disabled = false;
    searchInput.placeholder = 'Search contracts...';
    accomSel.disabled = false;
  }
}

function fillRequestFields(rec: PricingRequestRow): void {
  if (rec.oprx_accommodationdays) inputById('fAccomDays').value = String(rec.oprx_accommodationdays);
  if (rec.oprx_extradoctorfee) {
    inputById('fDoctorFee').value = String(rec.oprx_extradoctorfee);
    // Pre-fill the Billing Review doctor fee too
    const billingFee = findById<HTMLInputElement>('fBillingDoctorFee');
    if (billingFee) billingFee.value = String(rec.oprx_extradoctorfee);
  }
  if (rec.oprx_mainoperationname) {
    inputById('fMainOp').value = rec.oprx_mainoperationname;
    updateCharCounter('fMainOp', 'ctrMainOp', 250);
  }
  if (rec.oprx_billingremarks) inputById('fBillingRemarks').value = rec.oprx_billingremarks;
  if (rec.oprx_billingextrafees) {
    inputById('fBillingExtraFees').value = String(rec.oprx_billingextrafees);
    S.billingExtraFee = parseFloat(String(rec.oprx_billingextrafees)) || 0;
    onBillingExtraFeesChange();
  }

  if (rec._oprx_specialty_value) {
    const sp = getSDropItems('specialty').find((s) => s.id === rec._oprx_specialty_value);
    if (sp) {
      setSDropValue('specialty', sp.id, sp.name);
      setSDropValue('billingSpecialty', sp.id, sp.name);
    } else {
      inputById('fSpecialty').value = rec._oprx_specialty_value;
      inputById('fBillingSpecialty').value = rec._oprx_specialty_value;
    }
  }

  if (rec.oprx_extconsumables) {
    inputById('fExtConsumables').checked = true;
    setHasConsumables(true);
  }
  if (rec.oprx_consumablesdesc) {
    inputById('fConsumablesDesc').value = rec.oprx_consumablesdesc;
    updateCharCounter('fConsumablesDesc', 'ctrConsDesc', 1000);
  }
}

/** Dataverse fills <column>_name when a file is stored in the column. */
function showSavedFiles(rec: PricingRequestRow): void {
  const show = (fileName: string | null | undefined, statusId: string, nameId: string, flag: 'hasInsuranceCard' | 'hasReferral') => {
    if (!fileName) return;
    S[flag] = true;
    const statusEl = findById(statusId);
    const nameEl = findById(nameId);
    if (statusEl) statusEl.style.display = 'flex';
    // The name comes back URL-encoded
    const displayName = decodeURIComponent(fileName);
    if (nameEl) nameEl.textContent = `${displayName} ✓`;
    console.log(`[LOAD] File exists: ${displayName}`);
  };
  show(rec.oprx_insurancecard_name, 'insuranceFileStatus', 'insuranceFileName', 'hasInsuranceCard');
  show(rec.oprx_orreferral_name, 'referralFileStatus', 'referralFileName', 'hasReferral');
}

async function openTabForStatus(rec: PricingRequestRow, statusLabel: string): Promise<void> {
  const status = rec.oprx_status;
  const recordId = S.recordId!;
  // Banners render after tabs are frozen so they show the "Section Locked" pill
  const tab1Banner = () => {
    if (rec.createdby?.fullname) renderAuditBanner(1, rec.createdby.fullname, rec.createdon, 'Created by');
  };
  const tab2Banner = () => {
    if (S.hasConsumables && S.tab2BannerAuthor) renderAuditBanner(2, S.tab2BannerAuthor, S.tab2BannerDate, 'Submitted by');
  };
  const supplyChainDone = () => {
    if (S.hasConsumables) {
      completeTabs(2);
      unlockTab(2);
    }
  };

  unlockTab(1);

  if (status === Status.PendingSupplyChain) {
    completeTabs(1);
    unlockTab(2);
    goTab(2);
    await showResolvedQueryBanner(recordId);
    tab1Banner();
    showToast('Request loaded — enter consumables pricing.', 'success');
  } else if (status === Status.PendingOrInfo) {
    // Supply Chain asked for missing info — Tab 1 stays editable with the question popup
    unfreezeTab(1);
    goTab(1);
    await showOrQueryBanner(recordId);
    tab1Banner();
    showToast('Supply Chain needs more info — please reply.', 'warning');
  } else if (status === Status.PendingBilling) {
    completeTabs(1);
    supplyChainDone();
    unlockTab(3);
    goTab(3);
    tab1Banner();
    tab2Banner();
    showToast('Request loaded — complete Billing Review.', 'success');
  } else if (status === Status.PendingApproval || status === Status.Approved || status === Status.Rejected) {
    completeTabs(1);
    supplyChainDone();
    completeTabs(3, 4);
    unlockTab(3);
    unlockTab(4);
    unlockTab(5);
    await loadProcedureCosts(recordId);
    await loadPricingOutput(recordId);
    const approvalLog = await loadApprovalLog(recordId);
    goTab(5);
    showApprovalReady(approvalBreakdownText());
    tab1Banner();
    tab2Banner();
    if (rec.modifiedby?.fullname) renderAuditBanner(3, rec.modifiedby.fullname, rec.modifiedon, 'Reviewed by');

    // Pending Approval keeps the Approve / Reject buttons; a decision replaces them with the result
    if (findById('approvalDecisionArea')) {
      if (status === Status.Approved) {
        completeTabs(5);
        renderApproved(approvalLog?.oprx_comments);
      } else if (status === Status.Rejected) {
        completeTabs(5);
        markTabRejected(5);
        renderRejected(approvalLog?.oprx_rejectionreason || '—', approvalLog?.oprx_suggestedprice, approvalLog?.oprx_comments);
      }
    }
    showToast('Request loaded — ' + statusLabel, 'success');
  } else {
    // Draft → editable Tab 1
    goTab(1);
  }
}
