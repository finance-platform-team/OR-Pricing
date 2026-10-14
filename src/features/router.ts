/**
 * URL-driven navigation between the list, a request form (?id=<guid>) and the
 * compliance dashboard (?view=compliance), including browser back/forward.
 */
import { loadComplianceData } from './compliance';
import { filterList, loadListData } from './list';
import { loadExistingRecord } from './loadRecord';
import { loadPatients } from './patients';
import { resetForm } from './resetForm';
import { loadSpecialties } from './specialties';
import { loadUser } from './user';
import { showComplianceView, showFormView, showListView } from './views';

/**
 * Record id from ?id= / ?recordId= (braces stripped, lower-cased).
 * In the code app, launch params are copied into the URL by applyLaunchParams().
 */
function getRecordIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('recordId') || '';
    if (id) return id.replace(/[{}]/g, '').toLowerCase();
  } catch (e) {
    console.warn('[URL] Could not get record ID:', e);
  }
  return null;
}

const isComplianceUrl = () => new URLSearchParams(window.location.search).get('view') === 'compliance';

/** Decides the initial view on startup. */
export function initRouter(): void {
  const id = getRecordIdFromUrl();
  if (isComplianceUrl()) {
    showComplianceView();
    loadUser();
    loadComplianceData();
  } else if (id) {
    showFormView();
    // Specialties must be loaded before the record looks up its specialty name
    Promise.all([loadPatients(), loadSpecialties()]).then(() => loadExistingRecord(id));
  } else {
    showListView();
    loadListData();
    loadUser();
    // Preload for when the user clicks New
    loadSpecialties();
    loadPatients();
  }
}

export function installPopstateHandler(): void {
  window.addEventListener('popstate', () => {
    const id = getRecordIdFromUrl();
    if (isComplianceUrl()) {
      showComplianceView();
      loadComplianceData();
    } else if (id) {
      openRecordView(id);
    } else {
      showListView();
      filterList();
    }
  });
}

function openRecordView(recordId: string): void {
  showFormView();
  resetForm();
  loadExistingRecord(recordId);
}

export function openRecord(recordId: string): void {
  history.pushState({ id: recordId }, '', `?id=${recordId}`);
  openRecordView(recordId);
}

export function openNewForm(): void {
  resetForm();
  showFormView();
  history.pushState({}, '', window.location.pathname);
}

export function goBackToList(): void {
  history.pushState({}, '', window.location.pathname);
  showListView();
  loadListData();
}

export function openComplianceDashboard(): void {
  history.pushState({ view: 'compliance' }, '', '?view=compliance');
  showComplianceView();
  loadComplianceData();
}

export function closeComplianceDashboard(): void {
  history.pushState({}, '', window.location.pathname);
  showListView();
  filterList();
}
