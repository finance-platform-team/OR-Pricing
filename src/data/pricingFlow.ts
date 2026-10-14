/**
 * DotCare pricing via the Power Automate HTTP trigger (FLOW_URL).
 * Called without credentials to avoid CORS — the `sig` in the URL authenticates.
 */
import { FLOW_URL } from '../config';
import type { CostMap } from '../types';

export interface PricingQuery {
  ContractName: string;
  AccommodationClassName: string;
  Operation: string;
  Hospital: string;
  Specialty: string;
}

interface FlowRow {
  EnName?: string;
  finalPrice?: number | string;
}

/** Full prices of one procedure's cost elements. Throws when the flow fails. */
export async function fetchProcedurePricing(query: PricingQuery): Promise<CostMap> {
  const resp = await fetch(FLOW_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!resp.ok) {
    console.warn('[FLOW] Status:', resp.status, await resp.text().catch(() => ''));
    throw new Error(`Pricing service returned status ${resp.status}`);
  }

  const data = await resp.json();
  // The flow answers { "Table1": [...] }
  const rows: FlowRow[] = Array.isArray(data) ? data : data.Table1 || [];
  if (!Array.isArray(rows) || !rows.length) {
    // Fallback: older flow versions returned an object with the cost fields directly
    return data as CostMap;
  }

  // Case-insensitive, trimmed contains-match — flow row names may change slightly
  const find = (keyword: string) => {
    const row = rows.find((r) => (r.EnName || '').trim().toLowerCase().includes(keyword));
    return parseFloat(String(row?.finalPrice ?? 0));
  };
  const costs: CostMap = {
    Accommodation: find('accommodation'),
    NursingCare: find('nursing'),
    MedicalCare: find('medical care'),
    ORRoom: find('operating room'),
    SurgeonFee: find('surgeon fee'),
    AssistantFee: find('assistant'),
    AnesthesiaFee: find('anesthes'),
  };
  console.log('[FLOW] Parsed costs:', costs, 'from rows:', rows.map((r) => r.EnName));
  return costs;
}
