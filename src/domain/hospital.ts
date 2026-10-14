/** oprx_hospital choice values (as the strings used by the <select> and OData filters). */
export const Hospital = {
  SMH: '129990000',
  AMH: '129990001',
  ASH: '129990002',
} as const;

const HOSPITAL_LABEL: Record<string, string> = {
  [Hospital.SMH]: 'SMH',
  [Hospital.AMH]: 'AMH',
  [Hospital.ASH]: 'ASH',
};

export function getHospitalLabel(value: number | string | null | undefined): string {
  return (value != null && HOSPITAL_LABEL[String(value)]) || '—';
}

/** crd04_specialtieses.cr18c_tag values. */
const SPECIALTY_TAG_AMH = '129990001';
const SPECIALTY_TAG_ANC = '989230001';

/**
 * Specialty tag for a hospital: AMH → "OR Pricing AMH", SMH / ASH → "OR Pricing ANC".
 * No hospital → null (the specialty picker is disabled).
 */
export function getSpecialtyTagForHospital(hospital: string): string | null {
  if (!hospital) return null;
  return hospital === Hospital.AMH ? SPECIALTY_TAG_AMH : SPECIALTY_TAG_ANC;
}
