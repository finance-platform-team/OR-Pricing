/**
 * Compliance dashboard built on oprx_statusauditlogs: exact time per team for
 * every request (including repeated Supply Chain ⇄ OR returns), KPIs and a CSV export.
 */
import { COMPLIANCE_TOP } from '../config';
import { dvList } from '../data/dataverse';
import type { PricingRequestRow, StatusAuditLogRow } from '../data/rows';
import { getHospitalLabel } from '../domain/hospital';
import {
  STATUS_CLASS,
  STATUS_DOT_COLOR,
  Status,
  TEAM_OF_STATUS,
  getStatusLabel,
  isTerminalStatus,
} from '../domain/status';
import { byId, esc, findById, inputById, valueOf } from '../ui/dom';
import { errorMessage, showToast } from '../ui/feedback';
import { formatDate, formatTatHours, MS_PER_HOUR } from '../ui/format';

interface ComplianceRow {
  id: string;
  requestName: string;
  operation: string;
  patientName: string;
  hospital: string;
  createdon: string | undefined;
  status: number;
  statusLabel: string;
  scHrs: number;
  orHrs: number;
  billHrs: number;
  loopCount: number;
  totalCycleHrs: number;
  isClosed: boolean;
}

/** Last computed rows, so Export doesn't fetch again. */
let rows: ComplianceRow[] = [];

/** Audit logs are fetched for this many requests per query (OR-ed filter). */
const LOG_CHUNK = 30;

function dateFilter(): string {
  const from = valueOf('compDateFrom');
  const to = valueOf('compDateTo');
  const parts: string[] = [];
  if (from) parts.push(`createdon ge ${from}T00:00:00Z`);
  if (to) parts.push(`createdon le ${to}T23:59:59Z`);
  return parts.join(' and ');
}

export function clearComplianceDateFilter(): void {
  inputById('compDateFrom').value = '';
  inputById('compDateTo').value = '';
  loadComplianceData();
}

async function fetchLogsByRequest(reqIds: string[]): Promise<Record<string, StatusAuditLogRow[]>> {
  const chunks: string[][] = [];
  for (let i = 0; i < reqIds.length; i += LOG_CHUNK) chunks.push(reqIds.slice(i, i + LOG_CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) =>
      dvList<StatusAuditLogRow>(
        `oprx_statusauditlogs?$select=oprx_status,createdon,_oprx_pricingrequest_value` +
          `&$expand=createdby($select=fullname)` +
          `&$filter=${chunk.map((id) => `_oprx_pricingrequest_value eq ${id}`).join(' or ')}&$orderby=createdon asc`,
      ).catch((e) => {
        console.error('[COMPLIANCE] chunk fetch failed:', e);
        return [] as StatusAuditLogRow[];
      }),
    ),
  );

  const byReq: Record<string, StatusAuditLogRow[]> = {};
  for (const log of results.flat()) {
    const rid = log._oprx_pricingrequest_value!;
    (byReq[rid] ??= []).push(log);
  }
  return byReq;
}

/** Per-team time, return loops and total cycle for one request. */
function toComplianceRow(req: PricingRequestRow, reqLogs: StatusAuditLogRow[]): ComplianceRow {
  const logs = [...reqLogs].sort((a, b) => new Date(a.createdon).getTime() - new Date(b.createdon).getTime());
  const now = Date.now();
  let scMs = 0;
  let orMs = 0;
  let billMs = 0;
  let loopCount = 0;
  let firstTs = req.createdon ? new Date(req.createdon).getTime() : null;
  let lastTs = firstTs;

  logs.forEach((log, i) => {
    const start = new Date(log.createdon).getTime();
    const end = i < logs.length - 1 ? new Date(logs[i + 1].createdon).getTime() : now;
    const ms = isTerminalStatus(log.oprx_status) ? 0 : Math.max(end - start, 0);
    const team = TEAM_OF_STATUS[log.oprx_status];
    if (team === 'Supply Chain') scMs += ms;
    else if (team === 'OR Coordinator') orMs += ms;
    else if (team === 'Billing') billMs += ms;
    if (log.oprx_status === Status.PendingOrInfo) loopCount++;
    if (firstTs === null || start < firstTs) firstTs = start;
    if (lastTs === null || start > lastTs) lastTs = start;
  });

  const status = req.oprx_status ?? Status.Draft;
  const isClosed = isTerminalStatus(status);
  const totalCycleMs = firstTs !== null ? (isClosed ? lastTs! : now) - firstTs : 0;

  return {
    id: req.oprx_pricingrequestid,
    requestName: req.oprx_requestname || '—',
    operation: req.oprx_mainoperationname || '—',
    patientName: req.oprx_patientid?.opd_patientname || '—',
    hospital: getHospitalLabel(req.oprx_hospital),
    createdon: req.createdon,
    status,
    statusLabel: getStatusLabel(status),
    scHrs: scMs / MS_PER_HOUR,
    orHrs: orMs / MS_PER_HOUR,
    billHrs: billMs / MS_PER_HOUR,
    loopCount,
    totalCycleHrs: totalCycleMs / MS_PER_HOUR,
    isClosed,
  };
}

export async function loadComplianceData(): Promise<void> {
  const btn = findById<HTMLButtonElement>('btnComplianceRefresh');
  const kpiGrid = byId('complianceKpiGrid');
  const statusEl = byId('complianceStatusBars');
  const stageEl = byId('complianceStageAvgs');
  const tbody = byId('complianceTableBody');
  if (btn) btn.disabled = true;
  statusEl.innerHTML = `<div class="comp-loading">Loading…</div>`;
  stageEl.innerHTML = `<div class="comp-loading">Loading…</div>`;
  tbody.innerHTML = tableMessage('Loading…');

  const from = valueOf('compDateFrom');
  const to = valueOf('compDateTo');
  byId('compFilterHint').textContent = from || to ? `Filtered: ${from || '…'} → ${to || '…'}` : '';

  try {
    const filter = dateFilter();
    const requests = await dvList<PricingRequestRow>(
      `oprx_pricingrequests?$select=oprx_pricingrequestid,oprx_requestname,oprx_mainoperationname,createdon,oprx_status,oprx_hospital` +
        (filter ? `&$filter=${filter}` : '') +
        `&$expand=oprx_patientid($select=opd_patientname)` +
        `&$orderby=createdon desc&$top=${COMPLIANCE_TOP}`,
    );
    const logsByReq = requests.length ? await fetchLogsByRequest(requests.map((r) => r.oprx_pricingrequestid)) : {};
    if (requests.length) {
      const logCount = Object.values(logsByReq).reduce((s, a) => s + a.length, 0);
      console.log(`[COMPLIANCE] requests: ${requests.length} | audit logs: ${logCount}`);
    }

    rows = requests.map((req) => toComplianceRow(req, logsByReq[req.oprx_pricingrequestid] || []));
    kpiGrid.innerHTML = renderKpis();
    statusEl.innerHTML = renderStatusDistribution();
    stageEl.innerHTML = renderStageAverages();
    tbody.innerHTML = rows.length ? rows.map(renderRow).join('') : tableMessage('No requests found for this period.');
  } catch (e) {
    console.error('[COMPLIANCE LOAD ERROR]', e);
    tbody.innerHTML = tableMessage(`Failed to load: ${esc(errorMessage(e))}`, 'var(--red)');
    statusEl.innerHTML = `<div class="comp-loading" style="color:var(--red);">Failed to load.</div>`;
    stageEl.innerHTML = `<div class="comp-loading" style="color:var(--red);">Failed to load.</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

const tableMessage = (html: string, color = 'var(--text3)') =>
  `<tr><td colspan="9" style="padding:24px;text-align:center;color:${color};">${html}</td></tr>`;

const kpiCard = (accent: string, label: string, value: string | number, sub: string, valueColor = '') => `
      <div class="kpi-card"><div class="kpi-card-accent" style="background:${accent};"></div>
        <div class="kpi-card-label">${label}</div><div class="kpi-card-val"${valueColor ? ` style="color:${valueColor};"` : ''}>${value}</div>
        <div class="kpi-card-sub">${sub}</div></div>`;

function renderKpis(): string {
  const total = rows.length;
  const approved = rows.filter((r) => r.status === Status.Approved).length;
  const rejected = rows.filter((r) => r.status === Status.Rejected).length;
  const inProgress = total - approved - rejected;
  const withLoop = rows.filter((r) => r.loopCount > 0).length;
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const closed = rows.filter((r) => r.isClosed);
  const avgCycle = closed.length ? closed.reduce((s, r) => s + r.totalCycleHrs, 0) / closed.length : null;

  return [
    kpiCard('var(--brand)', 'Total Requests', total, 'In selected period'),
    kpiCard('var(--green)', 'Approved', approved, `${pctOf(approved)}% of total`, 'var(--green)'),
    kpiCard('var(--red)', 'Rejected', rejected, `${pctOf(rejected)}% of total`, 'var(--red)'),
    kpiCard('var(--amber)', 'In Progress', inProgress, 'Still moving through stages', 'var(--amber)'),
    kpiCard(withLoop ? 'var(--red)' : 'var(--green)', 'Return Loop Rate', `${pctOf(withLoop)}%`, `${withLoop} of ${total} needed a SC⇄OR round trip`),
    kpiCard('var(--blue)', 'Avg Total Cycle', formatTatHours(avgCycle), `Across ${closed.length} closed request(s)`),
  ].join('');
}

function renderStatusDistribution(): string {
  if (!rows.length) return `<div class="comp-loading">No requests in this period.</div>`;
  const counts: Record<number, number> = {};
  rows.forEach((r) => {
    counts[r.status] = (counts[r.status] || 0) + 1;
  });
  const maxCount = Math.max(...Object.values(counts), 1);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => {
      const color = STATUS_DOT_COLOR[Number(status)] || 'var(--text3)';
      const pct = Math.max((count / maxCount) * 100, 4);
      return `
        <div class="comp-status-row">
          <span class="comp-status-dot" style="background:${color};"></span>
          <span class="comp-status-label">${getStatusLabel(Number(status))}</span>
          <div class="comp-status-track"><div class="comp-status-fill" style="width:${pct}%;background:${color};"></div></div>
          <span class="comp-status-count">${count}</span>
        </div>`;
    })
    .join('');
}

/** Average hours per stage, over the requests that actually went through it. */
function stageAvg(key: 'scHrs' | 'orHrs' | 'billHrs'): number | null {
  const vals = rows.filter((r) => r[key] > 0).map((r) => r[key]);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function renderStageAverages(): string {
  const stage = (color: string, name: string, hrs: number | null) => `
      <div class="comp-stage-row">
        <span class="comp-stage-name"><span class="comp-stage-dot" style="background:${color};"></span>${name}</span>
        <span class="comp-stage-val">${formatTatHours(hrs)}</span>
      </div>`;
  return (
    stage('var(--amber)', 'Supply Chain', stageAvg('scHrs')) +
    stage('var(--red)', 'OR Coordinator Reply', stageAvg('orHrs')) +
    stage('var(--blue)', 'Billing &amp; Approval', stageAvg('billHrs'))
  );
}

function renderRow(r: ComplianceRow): string {
  const loopBadge = `<span class="comp-loop-badge ${r.loopCount > 0 ? 'has-loop' : 'no-loop'}">${r.loopCount}</span>`;
  const hrs = (h: number) => (h > 0 ? formatTatHours(h) : '—');
  const td = 'padding:12px 16px;';
  return `
      <tr>
        <td style="${td}"><span class="req-id-link" style="cursor:pointer;" data-onclick="openRecord('${esc(r.id)}')">${esc(r.requestName)}</span></td>
        <td style="${td}">${r.hospital}</td>
        <td style="${td}color:var(--text2);">${r.createdon ? formatDate(r.createdon) : '—'}</td>
        <td style="${td}"><span class="status-badge ${STATUS_CLASS[r.status] || 'draft'}">${r.statusLabel}</span></td>
        <td style="${td}text-align:right;" class="dash-tat-num">${hrs(r.scHrs)}</td>
        <td style="${td}text-align:right;" class="dash-tat-num">${hrs(r.orHrs)}</td>
        <td style="${td}text-align:right;" class="dash-tat-num">${hrs(r.billHrs)}</td>
        <td style="${td}text-align:center;">${loopBadge}</td>
        <td style="${td}text-align:right;" class="dash-tat-num">${formatTatHours(r.totalCycleHrs)}</td>
      </tr>`;
}

/** Exports the current table as CSV (UTF-8 with BOM so Excel reads Arabic correctly). */
export function exportComplianceCSV(): void {
  if (!rows.length) {
    showToast('No data to export — load the dashboard first.', 'error');
    return;
  }
  const headers = [
    'Request', 'Operation', 'Patient', 'Hospital', 'Created On', 'Current Status',
    'Supply Chain (hrs)', 'OR Coordinator Reply (hrs)', 'Billing & Approval (hrs)',
    'Return Loops', 'Total Cycle (hrs)',
  ];
  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const hrs = (h: number) => (h ? h.toFixed(2) : '0');
  const lines = rows.map((r) =>
    [
      r.requestName, r.operation, r.patientName, r.hospital,
      r.createdon ? new Date(r.createdon).toLocaleDateString('en-GB') : '',
      r.statusLabel, hrs(r.scHrs), hrs(r.orHrs), hrs(r.billHrs), r.loopCount, hrs(r.totalCycleHrs),
    ]
      .map(escapeCsv)
      .join(','),
  );

  const csv = '﻿' + [headers.join(','), ...lines].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `OR_Pricing_Compliance_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Compliance report exported.', 'success');
}
