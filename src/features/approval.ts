/** Tab 5 — Approval: the Billing Team approves or rejects the estimate. */
import { dvList, dvPatch, dvPost, odataRef } from '../data/dataverse';
import type { ApprovalLogRow } from '../data/rows';
import { Decision, OutputStatus, Status } from '../domain/status';
import { S } from '../state';
import { byId, esc, findById, inputById, valueOf } from '../ui/dom';
import { clearFieldError, errorMessage, nowIso, renderAuditBanner, setFieldError, showToast, updateStatus } from '../ui/feedback';
import { fmt } from '../ui/format';
import { icon } from '../ui/icons';
import { requestBind, setRequestStatus } from './persistence';
import { completeTabs, freezeTab, markTabRejected } from './tabs';

export function toggleRejectForm(): void {
  const f = byId('rejectForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

const ALERT_ICON_STYLE = 'width:20px;height:20px;flex-shrink:0;';
const notesHtml = (comments: string | null | undefined) =>
  comments ? `<br><span style="font-size:12px;opacity:.7;">Notes: ${esc(comments)}</span>` : '';

export function renderApproved(comments: string | null | undefined): void {
  byId('approvalDecisionArea').innerHTML = `
    <div class="alert alert-success" style="font-size:13px;padding:18px;margin-top:8px;">
      ${icon('checkCircle', ALERT_ICON_STYLE)}
      <div><strong>Estimate Approved</strong>${notesHtml(comments)}<br><span style="font-size:11px;opacity:.6;">Approved by Billing Team · EGP ${fmt(S.finalEstimate)}</span></div>
    </div>`;
}

export function renderRejected(reason: string, suggestedPrice: number | null | undefined, comments: string | null | undefined): void {
  const suggested = suggestedPrice
    ? `<br><span style="font-size:12px;color:var(--amber);font-weight:600;">Suggested Price: EGP ${fmt(suggestedPrice)}</span>`
    : '';
  byId('approvalDecisionArea').innerHTML = `
    <div class="alert alert-danger" style="font-size:13px;padding:18px;margin-top:8px;">
      ${icon('xCircle', ALERT_ICON_STYLE)}
      <div><strong>Estimate Rejected</strong><br><span style="font-size:12px;">Reason: ${esc(reason)}</span>${suggested}${notesHtml(comments)}<br><span style="font-size:11px;opacity:.6;">Rejected by Billing Team</span></div>
    </div>`;
}

const outputBind = () => (S.outputId ? { 'oprx_pricingoutputid@odata.bind': odataRef('oprx_pricingoutputs', S.outputId) } : {});

export async function approveRequest(): Promise<void> {
  const comments = inputById('fComments').value;
  try {
    await dvPost('oprx_approvallogs', {
      oprx_name: `APR-${Date.now().toString(36).toUpperCase()}`,
      oprx_decision: Decision.Approved,
      oprx_comments: comments,
      ...requestBind(),
      ...outputBind(),
    });
    if (S.recordId) await setRequestStatus(S.recordId, Status.Approved);
    if (S.outputId) await dvPatch('oprx_pricingoutputs', S.outputId, { oprx_outputstatus: OutputStatus.Approved });
  } catch (e) {
    console.error('[APPROVE ERROR]', e);
    showToast('Approval save failed: ' + (errorMessage(e) || 'Check console.'), 'error');
    return; // no UI update when the save failed
  }
  renderApproved(comments);
  completeTabs(5);
  updateStatus('Approved');
  renderAuditBanner(5, S.currentUserName, nowIso(), 'Approved by');
  showToast('Estimate approved.', 'success');
}

export async function confirmReject(): Promise<void> {
  const reason = inputById('fRejectionReason').value.trim();
  const comments = valueOf('fComments');
  const suggestedPrice = parseFloat(valueOf('fSuggestedPrice')) || 0;
  let valid = true;
  if (!reason) {
    setFieldError('fieldRejReason');
    valid = false;
  }
  if (!suggestedPrice) {
    setFieldError('fieldSuggestedPrice');
    valid = false;
  }
  if (!valid) {
    showToast('Please fill all required fields.', 'error');
    return;
  }
  try {
    await dvPost('oprx_approvallogs', {
      oprx_name: `REJ-${Date.now().toString(36).toUpperCase()}`,
      oprx_decision: Decision.Rejected,
      oprx_comments: comments,
      oprx_rejectionreason: reason,
      oprx_suggestedprice: suggestedPrice,
      ...requestBind(),
      ...outputBind(),
    });
    if (S.recordId) await setRequestStatus(S.recordId, Status.Rejected);
    if (S.outputId) await dvPatch('oprx_pricingoutputs', S.outputId, { oprx_outputstatus: OutputStatus.Rejected });
  } catch (e) {
    console.error('[REJECT ERROR]', e);
    showToast('Rejection save failed: ' + (errorMessage(e) || 'Check console.'), 'error');
    return;
  }
  renderRejected(reason, suggestedPrice, comments);
  markTabRejected(5);
  freezeTab(5);
  updateStatus('Rejected');
  renderAuditBanner(5, S.currentUserName, nowIso(), 'Rejected by');
  showToast('Estimate rejected.', 'success');
}

/** Latest approval decision; also renders the Tab 5 banner. */
export async function loadApprovalLog(recordId: string): Promise<ApprovalLogRow | null> {
  try {
    const [log] = await dvList<ApprovalLogRow>(
      `oprx_approvallogs?$select=oprx_approvallogid,oprx_decision,oprx_comments,oprx_rejectionreason,oprx_suggestedprice,createdon` +
        `&$expand=createdby($select=fullname)` +
        `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$orderby=createdon desc&$top=1`,
    );
    if (log) {
      if (log.createdby?.fullname) {
        const label = log.oprx_decision === Decision.Approved ? 'Approved by' : 'Rejected by';
        renderAuditBanner(5, log.createdby.fullname, log.createdon, label);
      }
      console.log(`[LOAD] Approval log loaded: ${log.oprx_approvallogid}`);
      return log;
    }
  } catch (e) {
    console.warn('[LOAD] Approval log failed:', e);
  }
  return null;
}

/** Restores the Approve / Reject controls after a decision alert replaced them. */
export function resetApprovalDecisionArea(): void {
  setInputs(['fComments', 'fRejectionReason', 'fSuggestedPrice'], '');
  const rejectForm = findById('rejectForm');
  if (rejectForm) rejectForm.style.display = 'none';
  const area = findById('approvalDecisionArea');
  if (area && !area.querySelector('.approval-grid')) area.innerHTML = APPROVAL_DECISION_HTML;
  clearFieldError('fieldRejReason');
  clearFieldError('fieldSuggestedPrice');
}

function setInputs(ids: string[], value: string): void {
  for (const id of ids) {
    const el = findById<HTMLInputElement>(id);
    if (el) el.value = value;
  }
}

/** Mirrors the #approvalDecisionArea markup in index.html. */
const APPROVAL_DECISION_HTML = `
        <div class="field" style="margin-bottom:16px;">
          <label>Review Comments <span class="opt">(optional)</span></label>
          <textarea id="fComments" placeholder="Add any review notes..."></textarea>
        </div>
        <div class="approval-grid">
          <div class="approval-card" style="border-color:var(--green-bdr);">
            <h3 style="color:var(--green);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Approve Estimate
            </h3>
            <p>Confirm the estimate is accurate and ready to communicate to the patient.</p>
            <button class="btn btn-success" style="width:100%;" data-onclick="approveRequest()">
              ${icon('check')}
              Confirm Approval
            </button>
          </div>
          <div class="approval-card" style="border-color:var(--red-bdr);">
            <h3 style="color:var(--red);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Reject Estimate
            </h3>
            <p>Return the request for correction. A rejection reason is mandatory.</p>
            <button class="btn btn-danger" style="width:100%;" data-onclick="toggleRejectForm()">
              ${icon('x')}
              Reject &amp; Return
            </button>
          </div>
        </div>
        <div id="rejectForm" style="display:none;margin-top:16px;">
          <div class="alert alert-danger">
            ${icon('warning')}
            <span>Rejection reason and suggested price are mandatory and will be shared with the OR Coordinator.</span>
          </div>
          <div class="form-grid" style="margin-bottom:12px;">
            <div class="field" id="fieldRejReason">
              <label>Rejection Reason <span class="req">*</span></label>
              <textarea id="fRejectionReason" placeholder="Explain why this estimate is being rejected..." maxlength="500"></textarea>
              <span class="validation-msg">Rejection reason is required.</span>
            </div>
            <div class="field" id="fieldSuggestedPrice">
              <label>Suggested Price (EGP) <span class="req">*</span></label>
              <input type="number" id="fSuggestedPrice" min="0" step="any" placeholder="0.00">
              <span class="validation-msg">Suggested price is required.</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-danger" data-onclick="confirmReject()">
              ${icon('check')}
              Confirm Rejection
            </button>
            <button class="btn btn-ghost" data-onclick="toggleRejectForm()">Cancel</button>
          </div>
        </div>`;
