/**
 * Supply Chain ⇄ OR info queries.
 *   Pending Supply Chain → [SC asks]     → Pending OR Info
 *   Pending OR Info      → [OR replies]  → Pending Supply Chain
 */
import { dvList, dvPatch, dvPost, odataRef } from '../data/dataverse';
import type { OrInfoQueryRow } from '../data/rows';
import { QueryStatus, Status } from '../domain/status';
import { S } from '../state';
import { byId, closeOverlay, findById, inputById } from '../ui/dom';
import { clearFieldError, errorMessage, setFieldError, showTabLoading, showToast, updateStatus } from '../ui/feedback';
import { filterList } from './list';
import { setRequestStatus } from './persistence';
import { showListView } from './views';

const QUERIES = 'oprx_orinfoqueries';

/* ── Supply Chain: ask the OR Coordinator for missing info ── */
export function openScAskModal(): void {
  inputById('fScQueryComment').value = '';
  clearFieldError('fieldScQuery');
  byId('scAskModalOverlay').style.display = 'flex';
}

export const closeScAskModal = (event?: Event) => closeOverlay('scAskModalOverlay', event);

export async function confirmScQuery(): Promise<void> {
  const query = inputById('fScQueryComment').value.trim();
  if (!query) {
    setFieldError('fieldScQuery');
    showToast("Please describe what's missing.", 'error');
    return;
  }
  if (!S.recordId) {
    showToast('Request not saved yet — cannot send query.', 'error');
    return;
  }

  showTabLoading(true, 'Sending to OR...');
  try {
    // oprx_name is an autonumber — Dataverse generates it
    await dvPost(QUERIES, {
      oprx_query: query,
      oprx_querystatus: QueryStatus.Open,
      'oprx_PricingRequest@odata.bind': odataRef('oprx_pricingrequests', S.recordId),
    });
    console.log('[SC QUERY] Created — awaiting OR reply');

    await setRequestStatus(S.recordId, Status.PendingOrInfo);
    console.log('[STATUS] → Pending OR Info (129990006)');

    closeScAskModal();
    updateStatus('Pending OR Info');
    showToast('Request sent back to OR Coordinator.', 'success');
    // The request isn't Supply Chain's to work on anymore
    showListView();
    filterList();
  } catch (e) {
    console.error('[SC QUERY ERROR]', e);
    showToast('Failed to send: ' + (errorMessage(e) || 'Unknown error'), 'error');
  } finally {
    showTabLoading(false);
  }
}

/* ── OR Coordinator: answer the open query ── */

/** Status Pending OR Info: loads the open query, shows the header button and opens the reply popup. */
export async function showOrQueryBanner(recordId: string): Promise<void> {
  try {
    const [q] = await dvList<OrInfoQueryRow>(
      `${QUERIES}?$filter=_oprx_pricingrequest_value eq ${recordId} and oprx_querystatus eq ${QueryStatus.Open}` +
        `&$orderby=createdon desc&$top=1&$select=oprx_orinfoqueryid,oprx_query,createdon` +
        `&$expand=createdby($select=fullname)`,
    );
    const btn = findById('scQueryPendingBtn');
    if (!q) {
      console.warn('[OR QUERY] Status is Pending OR Info but no open query record found.');
      if (btn) btn.style.display = 'none';
      return;
    }
    S.openQueryId = q.oprx_orinfoqueryid;
    S.openQueryData = {
      query: q.oprx_query || '—',
      meta: `Asked by ${q.createdby?.fullname || 'Supply Chain'} · ${new Date(q.createdon || '').toLocaleString()}`,
    };
    if (btn) btn.style.display = 'inline-flex';
    // Open it right away the first time so the OR Coordinator doesn't miss it
    openScQueryModal();
  } catch (e) {
    console.error('[LOAD OR QUERY ERROR]', e);
  }
}

export function openScQueryModal(): void {
  if (!S.openQueryData) return;
  byId('scQueryText').textContent = S.openQueryData.query;
  byId('scQueryMeta').textContent = S.openQueryData.meta;
  inputById('fOrReplyComment').value = '';
  clearFieldError('fieldOrReply');
  byId('scQueryModalOverlay').style.display = 'flex';
}

export const closeScQueryModal = (event?: Event) => closeOverlay('scQueryModalOverlay', event);

export async function confirmOrReply(): Promise<void> {
  const reply = inputById('fOrReplyComment').value.trim();
  if (!reply) {
    setFieldError('fieldOrReply');
    showToast('Please enter a reply.', 'error');
    return;
  }
  if (!S.openQueryId) {
    showToast('No open query found for this request.', 'error');
    return;
  }

  showTabLoading(true, 'Sending reply...');
  try {
    await dvPatch(QUERIES, S.openQueryId, { oprx_reply: reply, oprx_querystatus: QueryStatus.Answered });
    console.log('[OR REPLY] Query answered:', S.openQueryId);

    await setRequestStatus(S.recordId!, Status.PendingSupplyChain);
    console.log('[STATUS] → Pending Supply Chain (129990001)');

    closeScQueryModal();
    byId('scQueryPendingBtn').style.display = 'none';
    S.openQueryId = null;
    S.openQueryData = null;
    updateStatus('Pending Supply Chain');
    showToast('Reply sent — request returned to Supply Chain.', 'success');
    showListView();
    filterList();
  } catch (e) {
    console.error('[OR REPLY ERROR]', e);
    showToast('Failed to send reply: ' + (errorMessage(e) || 'Unknown error'), 'error');
  } finally {
    showTabLoading(false);
  }
}

/* ── Supply Chain: read the OR Coordinator's last answer ── */

/** Status Pending Supply Chain: loads the latest answered query for the "View Reply" button. */
export async function showResolvedQueryBanner(recordId: string): Promise<void> {
  try {
    const [q] = await dvList<OrInfoQueryRow>(
      `${QUERIES}?$filter=_oprx_pricingrequest_value eq ${recordId} and oprx_querystatus eq ${QueryStatus.Answered}` +
        `&$orderby=modifiedon desc&$top=1&$select=oprx_query,oprx_reply,modifiedon` +
        `&$expand=modifiedby($select=fullname)`,
    );
    S.lastResolvedQuery = q
      ? {
          query: q.oprx_query || '—',
          reply: q.oprx_reply || '—',
          meta: `Replied by ${q.modifiedby?.fullname || 'OR Coordinator'} · ${new Date(q.modifiedon || '').toLocaleString()}`,
        }
      : null;
    updateOrReplyButtonVisibility();
  } catch (e) {
    console.error('[LOAD RESOLVED QUERY ERROR]', e);
  }
}

/** The "View OR Coordinator's Reply" button shows only when a reply exists and the Supply Chain tab is open. */
export function updateOrReplyButtonVisibility(): void {
  const btn = findById('viewOrReplyBtn');
  if (btn) btn.style.display = S.lastResolvedQuery && S.currentTab === 2 ? 'inline-flex' : 'none';
}

export function openOrReplyModal(): void {
  if (!S.lastResolvedQuery) return;
  byId('orReplyQueryText').textContent = S.lastResolvedQuery.query;
  byId('orReplyText').textContent = S.lastResolvedQuery.reply;
  byId('orReplyMeta').textContent = S.lastResolvedQuery.meta;
  byId('orReplyModalOverlay').style.display = 'flex';
}

export const closeOrReplyModal = (event?: Event) => closeOverlay('orReplyModalOverlay', event);
