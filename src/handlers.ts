/**
 * Functions callable from data-on* attributes in index.html and generated
 * markup (see ui/handlerBridge.ts). Names here are part of the markup contract.
 */
import { approveRequest, confirmReject, toggleRejectForm } from './features/approval';
import { closeAuditTrailModal, openAuditTrailModal } from './features/auditTrail';
import { completeBillingReview, onBillingExtraFeesChange, toggleBillingEdit } from './features/billingReview';
import { clearComplianceDateFilter, exportComplianceCSV, loadComplianceData } from './features/compliance';
import {
  clearBillingContract,
  clearContract,
  onBillingContractSearch,
  onContractSearch,
  showBillingContractDropdown,
  showContractDropdown,
} from './features/contracts';
import { fetchCosts, submitToApproval } from './features/costing';
import { closeFilePreview, previewFile } from './features/filePreview';
import { filterList, loadListData, sortList } from './features/list';
import {
  closeOrReplyModal,
  closeScAskModal,
  closeScQueryModal,
  confirmOrReply,
  confirmScQuery,
  openOrReplyModal,
  openScAskModal,
  openScQueryModal,
} from './features/orQuery';
import { clearPatient, onPatientSearch, showPatientDropdown } from './features/patients';
import { completeTab1, onConsumablesToggle, onHospitalChange } from './features/requestInfo';
import { closeComplianceDashboard, goBackToList, openComplianceDashboard, openNewForm, openRecord } from './features/router';
import { addConsumableItem, completeTab2, removeConsumableItem, updateConsumable } from './features/supplyChain';
import { goTab, goTabPrev } from './features/tabs';
import { updateCharCounter, validateFileSize } from './ui/feedback';
import { clearSDropField, onSDropFocus, onSDropSearch } from './ui/searchDropdown';

export const HANDLERS = {
  addConsumableItem,
  approveRequest,
  clearBillingContract,
  clearComplianceDateFilter,
  clearContract,
  clearPatient,
  clearSDropField,
  closeAuditTrailModal,
  closeComplianceDashboard,
  closeFilePreview,
  closeOrReplyModal,
  closeScAskModal,
  closeScQueryModal,
  completeBillingReview,
  completeTab1,
  completeTab2,
  confirmOrReply,
  confirmReject,
  confirmScQuery,
  exportComplianceCSV,
  fetchCosts,
  filterList,
  goBackToList,
  goTab,
  goTabPrev,
  loadComplianceData,
  loadListData,
  onBillingContractSearch,
  onBillingExtraFeesChange,
  onConsumablesToggle,
  onContractSearch,
  onHospitalChange,
  onPatientSearch,
  onSDropFocus,
  onSDropSearch,
  openAuditTrailModal,
  openComplianceDashboard,
  openNewForm,
  openOrReplyModal,
  openRecord,
  openScAskModal,
  openScQueryModal,
  previewFile,
  removeConsumableItem,
  showBillingContractDropdown,
  showContractDropdown,
  showPatientDropdown,
  sortList,
  submitToApproval,
  toggleBillingEdit,
  toggleRejectForm,
  updateCharCounter,
  updateConsumable,
  validateFileSize,
};
