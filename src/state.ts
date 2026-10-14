/** State of the request form that is currently open. */
import type { ConsumableItem, Contract, OpenQuery, Patient, ProcedureCost, ResolvedQuery, TabNumber } from './types';

export interface FormState {
  recordId: string | null;
  outputId: string | null;
  currentTab: TabNumber;
  unlockedTabs: TabNumber[];
  hasConsumables: boolean;
  patientData: Patient | null;
  /** Active patients by id — loaded once, kept across forms */
  patientsCache: Record<string, Patient>;
  /** Contracts of the selected hospital */
  contractsCache: Contract[];
  /** Signed-in user (kept across forms) */
  currentUserId: string | null;
  currentUserName: string | null;
  procedureCosts: ProcedureCost[];
  procedureCostingIds: string[];
  consumableItems: ConsumableItem[];
  consumableItemIds: string[];
  primaryProcedureId: string | null;
  /** First oprx_consumablesitems row, created empty when Tab 1 is submitted with consumables */
  supplyChainRecordId: string | null;
  baseCostTotal: number;
  serviceFee: number;
  medSupplyTotal: number;
  consumablesTotal: number;
  doctorFee: number;
  billingExtraFee: number;
  finalEstimate: number;
  costsLoaded: boolean;
  hasInsuranceCard: boolean;
  hasReferral: boolean;
  tab2BannerAuthor: string | null;
  tab2BannerDate: string | null;
  openQueryId: string | null;
  openQueryData: OpenQuery | null;
  lastResolvedQuery: ResolvedQuery | null;
}

function initialState(keep?: Pick<FormState, 'patientsCache' | 'currentUserId' | 'currentUserName'>): FormState {
  return {
    recordId: null,
    outputId: null,
    currentTab: 1,
    unlockedTabs: [1],
    hasConsumables: false,
    patientData: null,
    patientsCache: keep?.patientsCache || {},
    contractsCache: [],
    currentUserId: keep?.currentUserId ?? null,
    currentUserName: keep?.currentUserName ?? null,
    procedureCosts: [],
    procedureCostingIds: [],
    consumableItems: [],
    consumableItemIds: [],
    primaryProcedureId: null,
    supplyChainRecordId: null,
    baseCostTotal: 0,
    serviceFee: 0,
    medSupplyTotal: 0,
    consumablesTotal: 0,
    doctorFee: 0,
    billingExtraFee: 0,
    finalEstimate: 0,
    costsLoaded: false,
    hasInsuranceCard: false,
    hasReferral: false,
    tab2BannerAuthor: null,
    tab2BannerDate: null,
    openQueryId: null,
    openQueryData: null,
    lastResolvedQuery: null,
  };
}

export const S: FormState = initialState();

/** Clears everything about the open request; keeps the patient cache and signed-in user. */
export function resetState(): void {
  Object.assign(S, initialState(S));
}
