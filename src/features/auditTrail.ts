/**
 * Audit trail popup: the request's full status timeline from oprx_statusauditlogs,
 * with the time spent in each step and per-team totals (return loops included).
 */
import { dvList } from '../data/dataverse';
import type { StatusAuditLogRow } from '../data/rows';
import { AUDIT_DOT_COLOR_OVERRIDE, getStatusLabel, isTerminalStatus, Status, TEAM_COLOR, TEAM_OF_STATUS } from '../domain/status';
import { S } from '../state';
import { byId, closeOverlay, esc, findById } from '../ui/dom';
import { formatTatHours, MS_PER_HOUR } from '../ui/format';
import { icon } from '../ui/icons';

/** Header button shows for any request that has been saved. */
export function updateAuditTrailButtonVisibility(): void {
  const btn = findById('auditTrailBtn');
  if (btn) btn.style.display = S.recordId ? 'inline-flex' : 'none';
}

const message = (text: string, color = 'var(--text3)') =>
  `<div style="text-align:center;color:${color};font-size:12.5px;padding:20px;">${text}</div>`;

export async function openAuditTrailModal(): Promise<void> {
  if (!S.recordId) return;
  byId('auditTrailModalOverlay').style.display = 'flex';
  const body = byId('auditTimelineBody');
  const totals = byId('auditTotalsRow');
  body.innerHTML = message('Loading…');
  totals.innerHTML = '';

  try {
    const logs = await dvList<StatusAuditLogRow>(
      `oprx_statusauditlogs?$filter=_oprx_pricingrequest_value eq ${S.recordId}` +
        `&$orderby=createdon asc&$select=oprx_status,createdon` +
        `&$expand=createdby($select=fullname)`,
    );
    if (!logs.length) {
      body.innerHTML = message('No audit history recorded yet for this request.');
      return;
    }

    // Each step lasts until the next one (or until now for the last one)
    const now = Date.now();
    const teamTotals: Record<string, number> = {};
    const items = logs.map((log, i) => {
      // Approved / Rejected close the request — they have no waiting time
      const isTerminal = isTerminalStatus(log.oprx_status);
      const start = new Date(log.createdon).getTime();
      const end = i < logs.length - 1 ? new Date(logs[i + 1].createdon).getTime() : now;
      const durationMs = isTerminal ? 0 : Math.max(end - start, 0);
      const team = TEAM_OF_STATUS[log.oprx_status] || '—';
      if (!isTerminal) teamTotals[team] = (teamTotals[team] || 0) + durationMs;
      // A return loop: entering Pending OR Info, or coming back to Pending Supply Chain
      const isLoopEntry =
        log.oprx_status === Status.PendingOrInfo ||
        (log.oprx_status === Status.PendingSupplyChain && logs.slice(0, i).some((l) => l.oprx_status === Status.PendingSupplyChain));
      return {
        statusLabel: getStatusLabel(log.oprx_status),
        dotColor: AUDIT_DOT_COLOR_OVERRIDE[log.oprx_status] || TEAM_COLOR[team] || 'var(--text3)',
        durationMs,
        isTerminal,
        isLoopEntry,
        isOngoing: i === logs.length - 1 && !isTerminal,
        byName: log.createdby?.fullname || '—',
        when: new Date(start).toLocaleString(),
      };
    });

    totals.innerHTML = Object.entries(teamTotals)
      .map(
        ([team, ms]) => `
      <div class="audit-total-chip">
        <div class="audit-total-chip-label" style="color:${TEAM_COLOR[team] || 'var(--text3)'};">${esc(team)}</div>
        <div class="audit-total-chip-val">${formatTatHours(ms / MS_PER_HOUR)}</div>
      </div>`,
      )
      .join('');

    body.innerHTML = items
      .map(
        (it) => `
      <div class="audit-item">
        <div class="audit-item-dot" style="background:${it.dotColor};"></div>
        <div class="audit-item-row">
          <span class="audit-item-status">${esc(it.statusLabel)}</span>
          <span class="audit-item-duration ${it.isLoopEntry ? 'is-loop' : ''}">
            ${it.isTerminal ? 'Closed' : (it.isOngoing ? 'Ongoing · ' : '') + formatTatHours(it.durationMs / MS_PER_HOUR)}
          </span>
        </div>
        <div class="audit-item-meta">${esc(it.byName)} · ${esc(it.when)}</div>
        ${it.isLoopEntry ? `<div class="audit-loop-tag">${icon('loop', 'width:10px;height:10px;', 2.5)} Return loop</div>` : ''}
      </div>`,
      )
      .join('');
  } catch (e) {
    console.error('[AUDIT TRAIL ERROR]', e);
    body.innerHTML = message('Failed to load audit trail.', 'var(--red)');
  }
}

export const closeAuditTrailModal = (event?: Event) => closeOverlay('auditTrailModalOverlay', event);
