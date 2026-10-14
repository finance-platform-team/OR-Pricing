/** Shared app-level types. Dataverse row shapes live in data/rows.ts. */

export type TabNumber = 1 | 2 | 3 | 4 | 5;

export type CostKey =
  | 'Accommodation'
  | 'NursingCare'
  | 'MedicalCare'
  | 'ORRoom'
  | 'SurgeonFee'
  | 'AssistantFee'
  | 'AnesthesiaFee';

/** Full (100%) price per cost element — numbers from DotCare, strings when rebuilt from saved rows. */
export type CostMap = Partial<Record<CostKey, number | string>>;

export interface ProcedureCost {
  id: string | null;
  name: string;
  classType: string;
  isPrimary: boolean;
  /** 100 for the primary procedure, 50 for secondaries */
  costPct: number;
  costs: CostMap;
}

export interface ConsumableItem {
  /** Local key for the row in the UI */
  idx: number;
  dvId?: string;
  name: string;
  baseCost: number;
  markupPct: number;
  finalCost: number;
}

export interface Patient {
  name: string;
  code: string;
  bu: string;
  age: string;
  gender: string;
  address: string;
}

export interface Contract {
  id: string;
  name: string;
}

export interface OpenQuery {
  query: string;
  meta: string;
}

export interface ResolvedQuery extends OpenQuery {
  reply: string;
}

/** A procedure picked in one of the three procedure slots on Tab 1. */
export interface SelectedProcedure {
  slot: 1 | 2 | 3;
  id: string;
  name: string;
  classType: string;
}
