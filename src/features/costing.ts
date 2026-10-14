/** Tab 4 — Cost & Pricing: DotCare prices, cost breakdown, totals and submit for approval. */
import { PRIMARY_COST_PCT, SECONDARY_COST_PCT, SERVICE_FEE_RATE } from '../config';
import { dvList } from '../data/dataverse';
import { fetchProcedurePricing } from '../data/pricingFlow';
import type { PricingOutputRow, ProcedureCostingRow } from '../data/rows';
import { CLASS_COLORS, getClassLabel, primaryIndex } from '../domain/classification';
import { costElementsFor, costLabel, costOf, medSupplyBase } from '../domain/pricing';
import { Status } from '../domain/status';
import { S } from '../state';
import type { ProcedureCost } from '../types';
import { byId, esc, findById, inputById, selectById, valueOf } from '../ui/dom';
import {
  errorMessage,
  hideProcessing,
  nowIso,
  renderAuditBanner,
  setFooter,
  showProcessing,
  showTabLoading,
  showToast,
  updateStatus,
} from '../ui/feedback';
import { fmt } from '../ui/format';
import {
  currentHospital,
  saveConsumableItems,
  savePricingOutput,
  saveProcedureCosts,
  saveRequestRecord,
  setRequestStatus,
  validConsumables,
} from './persistence';
import { readSelectedProcedures } from './procedures';
import { completeTabs, goTab, unlockTab } from './tabs';

/** Text of the selected <option> (its data-label / data-name when present). */
function selectedOptionLabel(selectId: string, dataKey: 'label' | 'name'): string {
  const sel = selectById(selectId);
  const opt = sel.options[sel.selectedIndex];
  return opt?.dataset?.[dataKey] || opt?.text || '';
}

function showBreakdown(): void {
  byId('costFetchAlert').style.display = 'none';
  byId('costBreakdownContainer').style.display = 'block';
}

export async function fetchCosts(): Promise<void> {
  const hospital = selectedOptionLabel('fHospital', 'label');
  const contractId = inputById('fContract').value;
  const contractName =
    (S.contractsCache || []).find((c) => c.id === contractId)?.name || inputById('contractSearchInput').value || '';
  const accomName = selectedOptionLabel('fAccomType', 'name');
  const procedures = readSelectedProcedures();
  const primaryIdx = primaryIndex(procedures.map((p) => p.classType));
  console.log('[PRIMARY DETECTION]', procedures.map((p) => `${p.name}(${p.classType})`), '→ Primary index:', primaryIdx);

  const spinner = byId('fetchSpinner');
  const btn = byId<HTMLButtonElement>('btnFetch');
  spinner.style.display = 'block';
  btn.disabled = true;
  showProcessing('Fetching from DotCare', 'Retrieving procedure pricing via stored procedure...');
  S.procedureCosts = [];
  try {
    for (const [i, proc] of procedures.entries()) {
      const isPrimary = i === primaryIdx;
      try {
        const costs = await fetchProcedurePricing({
          ContractName: contractName,
          AccommodationClassName: accomName,
          Operation: proc.name,
          Hospital: hospital,
          Specialty: valueOf('specialtySearch'),
        });
        S.procedureCosts.push({
          id: proc.id,
          name: proc.name,
          classType: proc.classType,
          isPrimary,
          costPct: isPrimary ? PRIMARY_COST_PCT : SECONDARY_COST_PCT,
          costs,
        });
      } catch (e) {
        console.error('[FLOW ERROR]', e);
        S.procedureCosts = [];
        S.costsLoaded = false;
        byId<HTMLButtonElement>('btnSubmitToApproval').disabled = true;
        byId('costBreakdownContainer').style.display = 'none';
        showToast(`Could not fetch costs for "${proc.name || 'procedure'}". Please try again or contact support.`, 'error');
        return;
      }
    }
    renderCostBreakdown();
    calculateAll();
    showBreakdown();
    byId<HTMLButtonElement>('btnSubmitToApproval').disabled = false;
    S.costsLoaded = true;
    showToast('Costs fetched successfully.', 'success');
  } finally {
    spinner.style.display = 'none';
    btn.disabled = false;
    hideProcessing();
  }
}

const pill = (bg: string, color: string, text: string) =>
  `<span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:${bg};color:${color};">${esc(text)}</span>`;

/** Renders the per-procedure cost table and updates S.baseCostTotal / S.medSupplyTotal. */
export function renderCostBreakdown(): void {
  const tbody = byId('costBreakdownBody');
  tbody.innerHTML = '';
  const hospital = currentHospital();
  let baseTotal = 0;
  S.medSupplyTotal = 0;

  S.procedureCosts.forEach((proc) => {
    const pct = proc.costPct / 100;
    const clr = CLASS_COLORS[proc.classType] || CLASS_COLORS['Minor'];
    costElementsFor(proc).forEach((key, i) => {
      const adj = costOf(proc, key) * pct;
      baseTotal += adj;
      const first = i === 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:12px;font-weight:500;">${first ? esc(proc.name) : ''}</td>
        <td>${first ? pill(clr.bg, clr.color, proc.classType) : ''}</td>
        <td>${
          first
            ? pill(
                proc.isPrimary ? 'var(--brand-light)' : 'var(--surface2)',
                proc.isPrimary ? 'var(--brand-dark)' : 'var(--text3)',
                `${proc.isPrimary ? 'Primary' : 'Secondary'} (${proc.costPct}%)`,
              )
            : ''
        }</td>
        <td style="font-size:12px;color:var(--text2);">${costLabel(key)}</td>
        <td class="cost-val">${fmt(adj)}</td>`;
      tbody.appendChild(tr);
    });

    const medsAmt = medSupplyBase(hospital, proc.classType) * (proc.isPrimary ? 1 : 0.5);
    S.medSupplyTotal += medsAmt;
    const medsTr = document.createElement('tr');
    medsTr.innerHTML = `
      <td></td><td></td><td></td>
      <td style="font-size:12px;color:var(--text2);font-style:italic;">Meds &amp; Supplies</td>
      <td class="cost-val" style="color:var(--amber);">${fmt(medsAmt)}</td>`;
    tbody.appendChild(medsTr);
  });

  S.baseCostTotal = baseTotal;
  byId('baseCostTotal').textContent = fmt(baseTotal);
}

/** Writes the totals in S to the summary panel. */
function renderTotals(): void {
  byId('sumBase').textContent = fmt(S.baseCostTotal);
  byId('sumService').textContent = fmt(S.serviceFee);
  byId('sumMeds').textContent = fmt(S.medSupplyTotal);
  byId('sumConsumables').textContent = fmt(S.consumablesTotal);
  byId('sumDoctor').textContent = fmt(S.doctorFee);
  byId('finalEstimate').textContent = fmt(S.finalEstimate);
  const extraRow = findById('rowBillingExtra');
  if (extraRow) extraRow.style.display = S.billingExtraFee > 0 ? 'flex' : 'none';
  const sumExtra = findById('sumBillingExtra');
  if (sumExtra) sumExtra.textContent = fmt(S.billingExtraFee);
}

/** Service fee, doctor fee and final estimate from the current base / meds / consumables totals. */
export function calculateAll(): void {
  S.serviceFee = S.baseCostTotal * SERVICE_FEE_RATE;
  // medSupplyTotal is already computed by renderCostBreakdown()
  const rawFee = parseFloat(inputById('fDoctorFee').value);
  // Keep the saved doctor fee when the input is empty / frozen
  S.doctorFee = !isNaN(rawFee) ? rawFee : S.doctorFee || 0;
  S.finalEstimate = S.baseCostTotal + S.serviceFee + S.medSupplyTotal + S.consumablesTotal + S.doctorFee + S.billingExtraFee;

  renderTotals();
  byId('approvalFinalVal').textContent = fmt(S.finalEstimate);

  // Progress bars relative to the final estimate
  const total = S.finalEstimate || 1;
  const bars: [string, number][] = [
    ['barBase', S.baseCostTotal],
    ['barService', S.serviceFee],
    ['barMeds', S.medSupplyTotal],
    ['barCons', S.consumablesTotal],
    ['barDoctor', S.doctorFee],
    ['barBillingExtra', S.billingExtraFee],
  ];
  // Reset to 0% first, then animate on the next frame so the CSS transition runs
  bars.forEach(([id]) => {
    const el = findById(id);
    if (el) el.style.width = '0%';
  });
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      bars.forEach(([id, val]) => {
        const el = findById(id);
        if (el) el.style.width = Math.min(100, (val / total) * 100).toFixed(1) + '%';
      }),
    ),
  );

  const extraPart = S.billingExtraFee > 0 ? ` + Extra Fees ${fmt(S.billingExtraFee)}` : '';
  const text = `Base ${fmt(S.baseCostTotal)} + Fees ${fmt(S.serviceFee)} + Meds ${fmt(S.medSupplyTotal)} + Consumables ${fmt(S.consumablesTotal)} + Doctor ${fmt(S.doctorFee)}${extraPart}`;
  byId('finalBreakdown').textContent = text;
  byId('approvalBreakdown').textContent = text;
}

/** Breakdown line shown on the Approval tab when a submitted request is reopened. */
export function approvalBreakdownText(): string {
  const extra = S.billingExtraFee > 0 ? ` + ${fmt(S.billingExtraFee)} (billing extra)` : '';
  return `${fmt(S.baseCostTotal)} + ${fmt(S.serviceFee)} (fees) + ${fmt(S.medSupplyTotal || 0)} (meds) + ${fmt(S.consumablesTotal)} (consumables) + ${fmt(S.doctorFee)} (doctor)${extra}`;
}

export function showApprovalReady(breakdown: string): void {
  byId('approvalPending').style.display = 'none';
  byId('approvalReady').style.display = 'block';
  byId('approvalFinalVal').textContent = fmt(S.finalEstimate);
  byId('approvalBreakdown').textContent = breakdown;
}

export async function submitToApproval(): Promise<void> {
  const spinner = byId('submitSpinner');
  const btn = byId<HTMLButtonElement>('btnSubmitToApproval');
  spinner.style.display = 'block';
  btn.disabled = true;
  showTabLoading(true, 'Saving pricing data...');

  try {
    if (!S.recordId) await saveRequestRecord();

    showTabLoading(true, 'Saving procedure costs...');
    await saveProcedureCosts();

    // Skip when the Supply Chain tab already saved them
    if (S.hasConsumables && validConsumables().length && !S.consumableItemIds.length) {
      showTabLoading(true, 'Saving consumables...');
      await saveConsumableItems();
    }

    showTabLoading(true, 'Saving pricing output...');
    await savePricingOutput();

    await setRequestStatus(S.recordId!, Status.PendingApproval);
    console.log('[SUBMIT] oprx_pricingrequest status → Pending Approval');

    completeTabs(4);
    renderAuditBanner(4, S.currentUserName, nowIso(), 'Submitted by');
    unlockTab(5);
    goTab(5);
    showApprovalReady(byId('finalBreakdown').textContent || '');
    updateStatus('Pending Approval');
    setFooter('circle', 'var(--amber)', 'Submitted — awaiting Billing Team approval.');
    showToast('Request submitted for approval.', 'success');
  } catch (e) {
    console.error('[SUBMIT ERROR]', e);
    showToast('Save error: ' + (errorMessage(e) || 'Check console for details.'), 'error');
  } finally {
    spinner.style.display = 'none';
    btn.disabled = false;
    showTabLoading(false);
  }
}

/** Rebuilds S.procedureCosts from saved oprx_procedurecostings rows (stored amounts are already at cost share). */
export async function loadProcedureCosts(recordId: string): Promise<void> {
  try {
    const rows = await dvList<ProcedureCostingRow>(
      `oprx_procedurecostings?$select=oprx_procedurecostingid,oprx_name,oprx_isprimary,oprx_costpercentage,` +
        `oprx_accommodation,oprx_medicalcare,oprx_nursing,oprx_orroom,oprx_surgeonfee,oprx_assistantfee,` +
        `oprx_anesthesia,oprx_medsupplyamount,oprx_subtotal,_oprx_procedureid_value,createdon` +
        `&$expand=oprx_procedureid($select=oprx_classtype),createdby($select=fullname)` +
        `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$orderby=oprx_isprimary desc`,
    );
    if (!rows.length) return;

    S.procedureCostingIds = rows.map((r) => r.oprx_procedurecostingid);
    S.procedureCosts = rows.map((r): ProcedureCost => {
      const isPrimary = r.oprx_isprimary;
      const costPct = r.oprx_costpercentage || (isPrimary ? PRIMARY_COST_PCT : SECONDARY_COST_PCT);
      const pct = costPct / 100;
      // Saved amounts are already scaled by the cost share — undo that to get full prices
      const full = (v: number | null | undefined) => (pct > 0 ? (v || 0) / pct : v || 0).toFixed(2);
      return {
        id: r._oprx_procedureid_value || null,
        name: r.oprx_name?.replace(/ — (Primary|Secondary)$/, '') || 'Procedure',
        isPrimary,
        costPct,
        classType: getClassLabel(r.oprx_procedureid?.oprx_classtype),
        costs: {
          Accommodation: full(r.oprx_accommodation),
          MedicalCare: full(r.oprx_medicalcare),
          NursingCare: full(r.oprx_nursing),
          ORRoom: full(r.oprx_orroom),
          SurgeonFee: full(r.oprx_surgeonfee),
          AssistantFee: full(r.oprx_assistantfee),
          AnesthesiaFee: full(r.oprx_anesthesia),
        },
      };
    });
    S.baseCostTotal = rows.reduce((a, r) => a + (r.oprx_subtotal || 0), 0);
    S.medSupplyTotal = rows.reduce((a, r) => a + (r.oprx_medsupplyamount || 0), 0);
    renderCostBreakdown();
    // Needed so serviceFee / finalEstimate aren't 0 after a reload
    calculateAll();
    showBreakdown();
    S.costsLoaded = true;

    const first = rows[0];
    if (first?.createdby?.fullname) renderAuditBanner(4, first.createdby.fullname, first.createdon, 'Submitted by');
    console.log(`[LOAD] ${rows.length} procedure costing row(s) loaded`);
  } catch (e) {
    console.warn('[LOAD] Procedure costs failed:', e);
  }
}

/** Saved totals from oprx_pricingoutputs override the recomputed ones where present. */
export async function loadPricingOutput(recordId: string): Promise<void> {
  try {
    const [out] = await dvList<PricingOutputRow>(
      `oprx_pricingoutputs?$select=oprx_pricingoutputid,oprx_finalestimate,oprx_basecoststotal,` +
        `oprx_servicefees,oprx_consumablestotal,oprx_doctorfee,oprx_outputstatus` +
        `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$top=1`,
    );
    if (!out) return;
    S.outputId = out.oprx_pricingoutputid;
    S.finalEstimate = out.oprx_finalestimate || S.finalEstimate;
    S.baseCostTotal = out.oprx_basecoststotal || S.baseCostTotal;
    S.serviceFee = out.oprx_servicefees || S.serviceFee;
    // medSupplyTotal comes from loadProcedureCosts(); billingExtraFee from the request row
    S.consumablesTotal = out.oprx_consumablestotal || S.consumablesTotal;
    S.doctorFee = out.oprx_doctorfee || S.doctorFee;
    renderTotals();
    console.log(`[LOAD] Pricing output loaded: ${S.outputId} — Final: EGP ${S.finalEstimate}`);
  } catch (e) {
    console.warn('[LOAD] Pricing output failed:', e);
  }
}
