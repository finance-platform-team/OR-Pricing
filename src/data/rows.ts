/** Shapes of the Dataverse rows the app reads (only the columns it selects). */

export interface UserRef {
  fullname?: string;
}

export interface PatientRow {
  opd_patientid: string;
  opd_patientname?: string;
  opd_patientcode?: string;
  opd_patientbu?: string;
  opd_butext?: string;
  opd_age?: number | null;
  opd_gendertext?: string;
  opd_address?: string;
}

export interface PricingRequestRow {
  oprx_pricingrequestid: string;
  oprx_requestname?: string;
  oprx_status?: number | null;
  oprx_mainoperationname?: string;
  oprx_extconsumables?: boolean;
  oprx_consumablesdesc?: string;
  oprx_extradoctorfee?: number | null;
  oprx_accommodationdays?: number | null;
  oprx_hospital?: number | null;
  oprx_insurancecard_name?: string | null;
  oprx_orreferral_name?: string | null;
  oprx_billingremarks?: string | null;
  oprx_billingextrafees?: number | null;
  _oprx_patientid_value?: string | null;
  _oprx_contractid_value?: string | null;
  _oprx_accommodationtypeid_value?: string | null;
  _oprx_specialty_value?: string | null;
  _oprx_procedure1id_value?: string | null;
  _oprx_procedure2id_value?: string | null;
  _oprx_procedure3id_value?: string | null;
  _oprx_primaryprocedureid_value?: string | null;
  createdon?: string;
  modifiedon?: string;
  createdby?: UserRef;
  modifiedby?: UserRef;
  oprx_patientid?: Partial<PatientRow> | null;
  oprx_procedure1id?: Partial<ProcedureRow> | null;
  oprx_procedure2id?: Partial<ProcedureRow> | null;
  oprx_procedure3id?: Partial<ProcedureRow> | null;
  oprx_primaryprocedureid?: Partial<ProcedureRow> | null;
}

export interface ContractRow {
  oprx_contractid: string;
  oprx_contractname: string;
}

export interface AccommodationTypeRow {
  oprx_accommodationtypeid: string;
  oprx_typename: string;
}

export interface ProcedureRow {
  oprx_procedureid: string;
  oprx_procedurename: string;
  oprx_classtype?: number | null;
}

export interface SpecialtyRow {
  crd04_specialtiesid: string;
  crd04_title: string;
}

export interface ConsumableItemRow {
  oprx_consumablesitemid: string;
  oprx_itemname?: string;
  oprx_basecost?: number | null;
  oprx_markuppct?: number | null;
  oprx_finalcost?: number | null;
  createdon?: string;
  modifiedon?: string;
  createdby?: UserRef;
  modifiedby?: UserRef;
}

export interface ProcedureCostingRow {
  oprx_procedurecostingid: string;
  oprx_name?: string;
  oprx_isprimary: boolean;
  oprx_costpercentage?: number | null;
  oprx_accommodation?: number | null;
  oprx_medicalcare?: number | null;
  oprx_nursing?: number | null;
  oprx_orroom?: number | null;
  oprx_surgeonfee?: number | null;
  oprx_assistantfee?: number | null;
  oprx_anesthesia?: number | null;
  oprx_medsupplyamount?: number | null;
  oprx_subtotal?: number | null;
  _oprx_procedureid_value?: string | null;
  createdon?: string;
  createdby?: UserRef;
  oprx_procedureid?: { oprx_classtype?: number | null } | null;
}

export interface PricingOutputRow {
  oprx_pricingoutputid: string;
  oprx_finalestimate?: number | null;
  oprx_basecoststotal?: number | null;
  oprx_servicefees?: number | null;
  oprx_consumablestotal?: number | null;
  oprx_doctorfee?: number | null;
  oprx_outputstatus?: number | null;
}

export interface ApprovalLogRow {
  oprx_approvallogid: string;
  oprx_decision?: number | null;
  oprx_comments?: string | null;
  oprx_rejectionreason?: string | null;
  oprx_suggestedprice?: number | null;
  createdon?: string;
  createdby?: UserRef;
}

export interface OrInfoQueryRow {
  oprx_orinfoqueryid: string;
  oprx_query?: string;
  oprx_reply?: string;
  createdon?: string;
  modifiedon?: string;
  createdby?: UserRef;
  modifiedby?: UserRef;
}

export interface StatusAuditLogRow {
  oprx_status: number;
  createdon: string;
  _oprx_pricingrequest_value?: string;
  createdby?: UserRef;
}
