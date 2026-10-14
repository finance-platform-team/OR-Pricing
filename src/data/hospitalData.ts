/** Per-hospital lookups, fetched together whenever a hospital is picked or a record is opened. */
import { dvList } from './dataverse';
import type { AccommodationTypeRow, ContractRow, ProcedureRow } from './rows';

export interface HospitalData {
  contracts: ContractRow[];
  accommodationTypes: AccommodationTypeRow[];
  procedures: ProcedureRow[];
}

export async function fetchHospitalData(hospital: string): Promise<HospitalData> {
  const active = `&$filter=statecode eq 0 and oprx_hospital eq ${hospital}`;
  const [contracts, accommodationTypes, procedures] = await Promise.all([
    dvList<ContractRow>(`oprx_contracts?$select=oprx_contractid,oprx_contractname${active}&$orderby=oprx_contractname asc`),
    dvList<AccommodationTypeRow>(
      `oprx_accommodationtypes?$select=oprx_accommodationtypeid,oprx_typename${active}&$orderby=oprx_typename asc`,
    ),
    dvList<ProcedureRow>(
      `oprx_procedures?$select=oprx_procedureid,oprx_procedurename,oprx_classtype${active}&$orderby=oprx_procedurename asc`,
    ),
  ]);
  return { contracts, accommodationTypes, procedures };
}
