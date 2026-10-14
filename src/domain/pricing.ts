/** Pure pricing rules — no DOM, no Dataverse. */
import { Hospital } from './hospital';
import type { ConsumableItem, CostKey, ProcedureCost } from '../types';

/** Meds & supplies allowance per hospital and class (EGP, for a primary procedure). */
const MED_SUPPLY_CONFIG: Record<string, Record<string, number>> = {
  [Hospital.SMH]: { 'Minor': 6000, 'Moderate': 8000, 'Major': 11000, 'Special Skills': 16000, 'Special Nature': 22000, 'Advanced': 28000 },
  [Hospital.AMH]: { 'Minor': 6000, 'Moderate': 8000, 'Major': 11000, 'Special Skills': 16000, 'Special Nature': 22000, 'Advanced': 28000 },
  [Hospital.ASH]: { 'Minor': 6000, 'Moderate': 10000, 'Major': 14000, 'Special Skills': 18000, 'Special Nature': 25000, 'Advanced': 30000 },
};

/** Full meds & supplies amount for a class at a hospital (unknown hospital → SMH table). */
export function medSupplyBase(hospital: string, classType: string): number {
  const cfg = MED_SUPPLY_CONFIG[hospital] || MED_SUPPLY_CONFIG[Hospital.SMH];
  return cfg[classType] || 0;
}

/**
 * Cost elements charged for a procedure. Secondary procedures only carry the
 * OR / surgeon / anesthesia elements; Minor procedures have no assistant fee.
 */
export function costElementsFor(proc: Pick<ProcedureCost, 'classType' | 'isPrimary'>): CostKey[] {
  const isMinor = proc.classType === 'Minor';
  if (proc.isPrimary) {
    return isMinor
      ? ['Accommodation', 'NursingCare', 'MedicalCare', 'ORRoom', 'SurgeonFee', 'AnesthesiaFee']
      : ['Accommodation', 'NursingCare', 'MedicalCare', 'ORRoom', 'SurgeonFee', 'AssistantFee', 'AnesthesiaFee'];
  }
  return isMinor ? ['ORRoom', 'SurgeonFee', 'AnesthesiaFee'] : ['ORRoom', 'SurgeonFee', 'AssistantFee', 'AnesthesiaFee'];
}

/** Full price of one cost element. */
export function costOf(proc: ProcedureCost, key: CostKey): number {
  return parseFloat(String(proc.costs[key] || 0));
}

/** Procedure subtotal at its cost share: charged elements + meds & supplies. */
export function procedureSubtotal(proc: ProcedureCost, hospital: string): number {
  const pct = proc.costPct / 100;
  const elements = costElementsFor(proc).reduce((sum, key) => sum + costOf(proc, key), 0) * pct;
  return elements + medSupplyBase(hospital, proc.classType) * pct;
}

export function consumableFinalCost(item: Pick<ConsumableItem, 'baseCost' | 'markupPct'>): number {
  return item.baseCost * (1 + item.markupPct / 100);
}

/** Final cost rounded to 2 decimals, as stored on oprx_consumablesitems from the Supply Chain tab. */
export function roundedConsumableFinalCost(item: Pick<ConsumableItem, 'baseCost' | 'markupPct'>): number {
  return parseFloat(consumableFinalCost(item).toFixed(2));
}

/** "SurgeonFee" → "Surgeon Fee" */
export function costLabel(key: CostKey): string {
  return key.replace(/([A-Z])/g, ' $1').trim();
}
