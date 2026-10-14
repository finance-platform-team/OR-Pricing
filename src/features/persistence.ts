/**
 * Saving the request to Dataverse:
 *   saveRequestRecord   → oprx_pricingrequests (POST / PATCH)
 *   uploadFiles         → oprx_insurancecard + oprx_orreferral file columns
 *   saveProcedureCosts  → oprx_procedurecostings (one row per procedure)
 *   saveConsumableItems → oprx_consumablesitems (one row per item)
 *   savePricingOutput   → oprx_pricingoutputs (one row)
 *   setRequestStatus    → oprx_status + oprx_statusauditlogs entry
 */
import { dvDelete, dvGet, dvPatch, dvPost, dvSetLookup, dvUploadFile, odataRef } from '../data/dataverse';
import type { PricingRequestRow } from '../data/rows';
import { medSupplyBase, procedureSubtotal } from '../domain/pricing';
import { OutputStatus, type StatusCode } from '../domain/status';
import { S } from '../state';
import type { ConsumableItem } from '../types';
import { byId, inputById, selectById, valueOf } from '../ui/dom';
import { errorMessage, hideProcessing, showProcessing } from '../ui/feedback';

const REQUESTS = 'oprx_pricingrequests';

/** Hospital currently selected on Tab 1 ("" when none). */
export const currentHospital = () => valueOf('fHospital');

/** `oprx_pricingrequestid@odata.bind` for the open request (empty when unsaved). */
export function requestBind(): Record<string, string> {
  return S.recordId ? { 'oprx_pricingrequestid@odata.bind': odataRef(REQUESTS, S.recordId) } : {};
}

/**
 * Records a status change (with its createdon / createdby) so the audit trail
 * can rebuild an exact timeline, including repeated Supply Chain ⇄ OR returns.
 * A failure here is only logged — it must not stop the main flow.
 */
export async function logStatusChange(recordId: string | null, newStatus: StatusCode): Promise<void> {
  if (!recordId) return;
  try {
    await dvPost('oprx_statusauditlogs', {
      oprx_status: newStatus,
      'oprx_pricingrequest@odata.bind': odataRef(REQUESTS, recordId),
    });
  } catch (e) {
    console.error('[AUDIT LOG ERROR]', e);
  }
}

/** Moves the request to a new status and logs it. */
export async function setRequestStatus(recordId: string, status: StatusCode): Promise<void> {
  await dvPatch(REQUESTS, recordId, { oprx_status: status });
  await logStatusChange(recordId, status);
}

/** Sets a lookup on an existing row (used for lookups that can't go in the create body). */
export async function linkLookup(set: string, recordId: string, navProp: string, relatedSet: string, relatedId: string): Promise<void> {
  try {
    await dvSetLookup(set, recordId, navProp, relatedSet, relatedId);
  } catch (e) {
    console.error(`[NAV PATCH ERROR] ${navProp}:`, e);
    throw new Error(`Navigation property update failed (${errorMessage(e)})`);
  }
}

const isValidId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 10;

/* ── oprx_pricingrequests ── */
export async function saveRequestRecord(statusVal: StatusCode | null = null): Promise<void> {
  const patientId = inputById('fPatient').value;
  const contractId = inputById('fContract').value;
  const accomId = selectById('fAccomType').value;
  const specialtyId = inputById('fSpecialty').value;
  const [p1, p2, p3] = [1, 2, 3].map((i) => inputById(`fProc${i}`).value);
  const primary = S.procedureCosts.find((p) => p.isPrimary);

  const body: Record<string, unknown> = {
    oprx_mainoperationname: inputById('fMainOp').value,
    oprx_hospital: parseInt(currentHospital()) || null,
    oprx_extconsumables: inputById('fExtConsumables').checked,
    oprx_consumablesdesc: inputById('fConsumablesDesc').value,
    oprx_extradoctorfee: parseFloat(inputById('fDoctorFee').value) || 0,
    oprx_accommodationdays: parseInt(inputById('fAccomDays').value) || 0,
    ...(statusVal !== null ? { oprx_status: statusVal } : {}),
  };

  // Lookups are only sent when a value is actually picked
  if (isValidId(patientId)) body['oprx_patientid@odata.bind'] = odataRef('opd_patients', patientId);
  if (isValidId(contractId)) body['oprx_contractid@odata.bind'] = odataRef('oprx_contracts', contractId);
  if (isValidId(specialtyId)) body['oprx_Specialty@odata.bind'] = odataRef('crd04_specialtieses', specialtyId);
  if (isValidId(p1)) body['oprx_procedure1id@odata.bind'] = odataRef('oprx_procedures', p1);
  if (isValidId(p2)) body['oprx_procedure2id@odata.bind'] = odataRef('oprx_procedures', p2);
  if (isValidId(p3)) body['oprx_procedure3id@odata.bind'] = odataRef('oprx_procedures', p3);
  // Primary comes from detectPrimary() on Tab 1
  const primaryId = S.primaryProcedureId || primary?.id || null;
  if (isValidId(primaryId)) body['oprx_primaryprocedureid@odata.bind'] = odataRef('oprx_procedures', primaryId);
  // The accommodation type is NOT sent here — it fails in the create body, so it is linked separately below

  if (S.recordId) {
    await dvPatch(REQUESTS, S.recordId, body);
  } else {
    S.recordId = await dvPost(REQUESTS, body);
    if (S.recordId) {
      // Show the autonumber Dataverse generated
      try {
        const created = await dvGet<PricingRequestRow>(`${REQUESTS}(${S.recordId})?$select=oprx_requestname`);
        const autoName = created?.oprx_requestname || S.recordId.substring(0, 8).toUpperCase();
        byId('reqId').textContent = autoName;
        console.log(`[SAVE] oprx_pricingrequest created: ${S.recordId} — Name: ${autoName}`);
      } catch (e) {
        console.warn('[SAVE] Could not fetch autonumber name:', errorMessage(e));
      }
    }
  }

  if (statusVal !== null) await logStatusChange(S.recordId, statusVal);

  if (S.recordId && isValidId(accomId)) {
    try {
      await linkLookup(REQUESTS, S.recordId, 'oprx_AccommodationTypeId', 'oprx_accommodationtypes', accomId);
      console.log(`[SAVE] AccommodationType linked: ${accomId}`);
    } catch (e) {
      // Not fatal — the request itself was saved
      console.warn('[WARN] AccommodationType link failed:', errorMessage(e));
    }
  }
}

/* ── File columns: Insurance Card & OR Referral ── */
export async function uploadFiles(): Promise<void> {
  const insuranceFile = inputById('fInsuranceCard').files?.[0];
  const referralFile = inputById('fReferral').files?.[0];
  if (!S.recordId) return;
  if (!insuranceFile && !referralFile) return;

  const total = (insuranceFile ? 1 : 0) + (referralFile ? 1 : 0);
  let done = 0;
  if (insuranceFile) {
    showProcessing('Uploading Insurance Card', `Uploading file 1 of ${total}...`);
    await uploadFile(S.recordId, 'oprx_insurancecard', insuranceFile);
    done++;
    console.log('[UPLOAD] Insurance card uploaded');
  }
  if (referralFile) {
    showProcessing('Uploading OR Referral', `Uploading file ${done + 1} of ${total}...`);
    await uploadFile(S.recordId, 'oprx_orreferral', referralFile);
    console.log('[UPLOAD] OR Referral uploaded');
  }
  hideProcessing();
}

async function uploadFile(recordId: string, column: string, file: File): Promise<void> {
  try {
    await dvUploadFile(REQUESTS, recordId, column, file);
  } catch (e) {
    throw new Error(`File upload failed: ${errorMessage(e)}`);
  }
}

/* ── oprx_procedurecostings (replaces earlier rows on re-submit) ── */
export async function saveProcedureCosts(): Promise<void> {
  if (!S.recordId || !S.procedureCosts.length) return;

  for (const id of S.procedureCostingIds) await dvDelete('oprx_procedurecostings', id);
  S.procedureCostingIds = [];

  const hospital = currentHospital();
  for (const proc of S.procedureCosts) {
    const pct = proc.costPct / 100;
    const cost = (v: number | string | undefined) => parseFloat(String(v || 0)) * pct;
    const body = {
      oprx_name: `${proc.name} — ${proc.isPrimary ? 'Primary' : 'Secondary'}`,
      oprx_isprimary: proc.isPrimary,
      oprx_costpercentage: proc.costPct,
      oprx_accommodation: cost(proc.costs.Accommodation),
      oprx_medicalcare: cost(proc.costs.MedicalCare),
      oprx_nursing: cost(proc.costs.NursingCare),
      oprx_orroom: cost(proc.costs.ORRoom),
      oprx_surgeonfee: cost(proc.costs.SurgeonFee),
      oprx_assistantfee: cost(proc.costs.AssistantFee),
      oprx_anesthesia: cost(proc.costs.AnesthesiaFee),
      oprx_medsupplyamount: medSupplyBase(hospital, proc.classType) * pct,
      oprx_subtotal: procedureSubtotal(proc, hospital),
      ...requestBind(),
      ...(proc.id ? { 'oprx_procedureid@odata.bind': odataRef('oprx_procedures', proc.id) } : {}),
    };
    const id = await dvPost('oprx_procedurecostings', body);
    if (id) S.procedureCostingIds.push(id);
    console.log(`[SAVE] oprx_procedurecosting: ${proc.name} (${proc.isPrimary ? 'Primary' : 'Secondary'})`);
  }
}

/** Items with a name and a base cost — the ones worth saving. */
export const validConsumables = (): ConsumableItem[] => S.consumableItems.filter((i) => i.name && i.baseCost > 0);

export function consumableBody(item: ConsumableItem, finalCost: number): Record<string, unknown> {
  return {
    oprx_itemname: item.name,
    oprx_basecost: item.baseCost,
    oprx_markuppct: item.markupPct,
    oprx_finalcost: finalCost,
    ...requestBind(),
  };
}

/* ── oprx_consumablesitems (replaces earlier rows on re-submit) ── */
export async function saveConsumableItems(): Promise<void> {
  if (!S.recordId) return;
  const items = validConsumables();
  if (!items.length) return;

  for (const id of S.consumableItemIds) await dvDelete('oprx_consumablesitems', id);
  S.consumableItemIds = [];

  for (const item of items) {
    const id = await dvPost('oprx_consumablesitems', consumableBody(item, item.finalCost));
    if (id) S.consumableItemIds.push(id);
    console.log(`[SAVE] oprx_consumablesitems: ${item.name} — EGP ${item.finalCost}`);
  }
}

/* ── oprx_pricingoutputs ── */
export async function savePricingOutput(): Promise<void> {
  if (!S.recordId) return;
  const body = {
    oprx_name: `OUT-${S.recordId.substring(0, 8).toUpperCase()}`,
    oprx_basecoststotal: S.baseCostTotal,
    oprx_servicefees: S.serviceFee,
    // Meds & supplies isn't stored — it is recomputed from the class/hospital table on reload
    oprx_consumablestotal: S.consumablesTotal,
    oprx_doctorfee: S.doctorFee,
    oprx_finalestimate: S.finalEstimate,
    oprx_outputstatus: OutputStatus.PendingApproval,
    ...requestBind(),
  };
  if (S.outputId) {
    await dvPatch('oprx_pricingoutputs', S.outputId, body);
    console.log(`[SAVE] oprx_pricingoutputs updated: ${S.outputId}`);
  } else {
    S.outputId = await dvPost('oprx_pricingoutputs', body);
    console.log(`[SAVE] oprx_pricingoutputs created: ${S.outputId}`);
  }
}
