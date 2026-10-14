/** Request list: load, stats, filter, sort and render. */
import { LIST_TOP } from '../config';
import { dvList } from '../data/dataverse';
import type { PricingRequestRow } from '../data/rows';
import { CLASS_COLORS, getClassLabel } from '../domain/classification';
import { STATUS_CLASS, Status, getStatusLabel } from '../domain/status';
import { byId, esc, findById, valueOf } from '../ui/dom';
import { showToast } from '../ui/feedback';
import { formatDate } from '../ui/format';
import { openRecord } from './router';

interface ListRecord {
  id: string;
  requestName: string;
  patientName: string;
  operation: string;
  proc1: string;
  proc2: string;
  proc3: string;
  primaryProcName: string;
  classification: string;
  status: number;
  hospital: string;
  consumables: boolean | undefined;
  createdon: string;
}

type SortField = keyof ListRecord;

const LIST = {
  records: [] as ListRecord[],
  filtered: [] as ListRecord[],
  sortField: 'createdon' as SortField,
  sortDir: 'desc' as 'asc' | 'desc',
};

/** Sortable column → header cell id */
const SORT_HEADER: Partial<Record<SortField, string>> = {
  requestName: 'th-reqid',
  patientName: 'th-patient',
  operation: 'th-op',
  classification: 'th-class',
  consumables: 'th-cons',
  status: 'th-status',
  createdon: 'th-date',
};

function toListRecord(r: PricingRequestRow): ListRecord {
  return {
    id: r.oprx_pricingrequestid,
    requestName: r.oprx_requestname || '—',
    patientName: r.oprx_patientid?.opd_patientname || '—',
    operation: r.oprx_mainoperationname || '—',
    proc1: r.oprx_procedure1id?.oprx_procedurename || '',
    proc2: r.oprx_procedure2id?.oprx_procedurename || '',
    proc3: r.oprx_procedure3id?.oprx_procedurename || '',
    primaryProcName: r.oprx_primaryprocedureid?.oprx_procedurename || '',
    classification: getClassLabel(r.oprx_primaryprocedureid?.oprx_classtype),
    status: r.oprx_status ?? Status.Draft,
    hospital: r.oprx_hospital != null ? String(r.oprx_hospital) : '',
    consumables: r.oprx_extconsumables,
    createdon: r.createdon || '',
  };
}

export async function loadListData(): Promise<void> {
  byId('listLoading').style.display = 'flex';
  byId('listEmpty').style.display = 'none';
  byId('listTable').style.display = 'none';

  try {
    const procedure = (nav: string) => `${nav}($select=oprx_procedurename,oprx_classtype)`;
    const expand = [
      'oprx_patientid($select=opd_patientname)',
      procedure('oprx_procedure1id'),
      procedure('oprx_procedure2id'),
      procedure('oprx_procedure3id'),
      procedure('oprx_primaryprocedureid'),
    ].join(',');
    const select =
      'oprx_pricingrequestid,oprx_requestname,oprx_mainoperationname,oprx_status,oprx_extconsumables,oprx_hospital,createdon';
    const rows = await dvList<PricingRequestRow>(
      `oprx_pricingrequests?$select=${select}&$expand=${expand}&$orderby=createdon desc&$top=${LIST_TOP}`,
    );
    LIST.records = rows.map(toListRecord);
  } catch (e) {
    console.error('[LIST] Failed to load requests:', e);
    LIST.records = [];
    showToast('Could not load pricing requests. Please refresh or contact support.', 'error');
  }

  updateListStats();
  filterList();
}

function updateListStats(): void {
  const count = (...statuses: number[]) => LIST.records.filter((r) => statuses.includes(r.status)).length;
  byId('statTotal').textContent = String(LIST.records.length);
  byId('statPending').textContent = String(count(Status.PendingSupplyChain));
  byId('statBilling').textContent = String(count(Status.PendingBilling, Status.PendingApproval));
  byId('statApproved').textContent = String(count(Status.Approved));
  byId('statRejected').textContent = String(count(Status.Rejected));
}

export function filterList(): void {
  const q = valueOf('listSearchInput').toLowerCase().trim();
  const status = valueOf('listStatusFilter');
  const hospital = valueOf('listHospitalFilter');

  LIST.filtered = LIST.records.filter((r) => {
    if (hospital && r.hospital !== hospital) return false;
    if (status && String(r.status) !== status) return false;
    if (q) {
      const haystack = [r.requestName, r.patientName, r.operation, r.proc1, r.proc2, r.proc3].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  sortListData();
  renderListTable();
}

export function sortList(field: SortField): void {
  if (LIST.sortField === field) {
    LIST.sortDir = LIST.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    LIST.sortField = field;
    LIST.sortDir = 'asc';
  }
  document.querySelectorAll('.list-table th').forEach((th) => th.classList.remove('sort-asc', 'sort-desc'));
  const thId = SORT_HEADER[LIST.sortField];
  if (thId) findById(thId)?.classList.add(LIST.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  sortListData();
  renderListTable();
}

function sortListData(): void {
  const f = LIST.sortField;
  const d = LIST.sortDir === 'asc' ? 1 : -1;
  LIST.filtered.sort((a, b) => {
    let av: unknown = a[f] ?? '';
    let bv: unknown = b[f] ?? '';
    if (typeof av === 'boolean') {
      av = av ? 1 : 0;
      bv = bv ? 1 : 0;
    }
    if (typeof av === 'number') return (av - (bv as number)) * d;
    return String(av).localeCompare(String(bv)) * d;
  });
}

const DASH = `<span style="color:var(--text3);font-size:11px;">—</span>`;

function renderListTable(): void {
  byId('listLoading').style.display = 'none';
  const tbody = byId('listTableBody');
  tbody.innerHTML = '';

  if (!LIST.filtered.length) {
    byId('listEmpty').style.display = 'block';
    byId('listTable').style.display = 'none';
    return;
  }
  byId('listEmpty').style.display = 'none';
  byId('listTable').style.display = 'table';

  LIST.filtered.forEach((r) => {
    const tr = document.createElement('tr');
    tr.onclick = () => openRecord(r.id);

    const clr = CLASS_COLORS[r.classification] || { bg: 'var(--surface2)', color: 'var(--text3)' };
    const classBadge = r.classification
      ? `<span class="class-badge" style="background:${clr.bg};color:${clr.color};">${esc(r.classification)}</span>`
      : DASH;
    const statusBadge = `<span class="status-badge ${STATUS_CLASS[r.status] || 'draft'}">${esc(getStatusLabel(r.status))}</span>`;

    // Primary procedure first (bold), then the others
    const primary = r.primaryProcName || r.proc1 || '';
    const secondaries = [r.proc1, r.proc2, r.proc3].filter(Boolean).filter((p) => p !== primary);
    let procsHtml = primary ? `<span class="cell-proc-primary">${esc(primary)}</span>` : '';
    secondaries.forEach((p) => {
      procsHtml += `<span class="cell-proc-secondary">+ ${esc(p)}</span>`;
    });

    const consHtml = r.consumables ? `<span class="cell-cons yes">● Yes</span>` : `<span class="cell-cons no">— No</span>`;
    const dateStr = r.createdon ? formatDate(r.createdon) : '—';

    tr.innerHTML = `
      <td><span class="req-id-link">${esc(r.requestName || '—')}</span></td>
      <td><span class="cell-patient">${esc(r.patientName || '—')}</span></td>
      <td><span class="cell-op" title="${esc(r.operation || '')}">${esc(r.operation || '—')}</span></td>
      <td>${procsHtml || DASH}</td>
      <td>${classBadge}</td>
      <td>${consHtml}</td>
      <td>${statusBadge}</td>
      <td class="cell-date">${dateStr}</td>
    `;
    tbody.appendChild(tr);
  });
}
