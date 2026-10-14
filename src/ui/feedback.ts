/** User feedback: toasts, overlays, footer line, status pill, field validation. */
import { MAX_FILE_BYTES } from '../config';
import { STATUS_PILL_STYLE } from '../domain/status';
import { byId, esc, findById } from './dom';
import { formatDateTime } from './format';
import { icon, type IconName } from './icons';

export type ToastType = 'success' | 'error' | 'warning';

export function showToast(msg: string, type: ToastType = 'success'): void {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = icon(type === 'success' ? 'check' : 'info') + `<span>${esc(msg)}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/** Message of an unknown thrown value. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e ?? '');
}

/* ── Field validation ── */
export function setFieldError(fieldId: string): void {
  findById(fieldId)?.classList.add('has-error');
}
export function clearFieldError(fieldId: string): void {
  findById(fieldId)?.classList.remove('has-error');
}

/* ── Full-screen processing overlay ── */
export function showProcessing(title: string, sub: string): void {
  byId('processingTitle').textContent = title || 'Processing...';
  byId('processingSub').textContent = sub || 'Please wait';
  byId('processingOverlay').classList.add('visible');
}
export function hideProcessing(): void {
  byId('processingOverlay').classList.remove('visible');
}

/* ── Footer status line ── */
export function setFooter(iconName: IconName, stroke: string, text: string, extraStyle = ''): void {
  byId('footerInfo').innerHTML =
    icon(iconName, `width:13px;height:13px;stroke:${stroke};${extraStyle}`) + ` ${esc(text)}`;
}

/** Disables the form's primary buttons while saving and shows a spinner line in the footer. */
export function showTabLoading(show: boolean, message = ''): void {
  const formView = findById('formView');
  formView?.querySelectorAll<HTMLButtonElement>('.btn-brand').forEach((btn) => {
    btn.disabled = show;
  });
  if (show && message) setFooter('spinner', 'var(--brand)', message, 'animation:spin .7s linear infinite;');
}

/* ── Header status pill ── */
export function updateStatus(label: string): void {
  const pill = byId('globalStatus');
  pill.textContent = label;
  const s = STATUS_PILL_STYLE[label] || STATUS_PILL_STYLE['Draft'];
  pill.style.background = s.bg;
  pill.style.color = s.color;
  pill.style.border = s.border;
}

/* ── Character counter under text inputs ── */
export function updateCharCounter(inputId: string, counterId: string, max: number): void {
  const el = findById<HTMLInputElement>(inputId);
  const ctr = findById(counterId);
  if (!el || !ctr) return;
  const len = el.value.length;
  ctr.textContent = `${len.toLocaleString()} / ${max.toLocaleString()}`;
  ctr.classList.remove('warn', 'over');
  if (len >= max) ctr.classList.add('over');
  else if (len >= max * 0.85) ctr.classList.add('warn');
}

/** Rejects files over the size limit as soon as they are picked. */
export function validateFileSize(input: HTMLInputElement, fieldId: string): boolean | undefined {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    input.value = '';
    setFieldError(fieldId);
    const msgEl = input.nextElementSibling as HTMLElement | null;
    if (msgEl && msgEl.classList.contains('validation-msg')) {
      const origMsg = msgEl.dataset.origMsg || msgEl.textContent || '';
      msgEl.dataset.origMsg = origMsg;
      msgEl.textContent = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max allowed is 32 MB.`;
      setTimeout(() => {
        msgEl.textContent = origMsg;
        clearFieldError(fieldId);
      }, 5000);
    }
    showToast(`File "${file.name}" exceeds 32 MB limit.`, 'error');
    return false;
  }
  clearFieldError(fieldId);
  return true;
}

/* ── "Created by / Submitted by …" banner at the top of each tab ── */
export function renderAuditBanner(tabNum: number, fullname: string | null | undefined, isoDatetime: string | null | undefined, label: string): void {
  const el = findById(`auditBanner${tabNum}`);
  if (!el || !fullname) return;
  const initial = fullname.charAt(0).toUpperCase();
  const dateStr = isoDatetime ? formatDateTime(isoDatetime) : '';
  const isFrozen = findById(`tabPanel${tabNum}`)?.classList.contains('tab-frozen');
  const lockedPill = isFrozen
    ? `<div class="locked-pill visible" style="margin-left:auto;">${icon('lock')} Section Locked</div>`
    : '';
  el.innerHTML = `
    <div class="audit-banner-wrap" style="justify-content:space-between;align-items:center;">
      <div class="audit-banner">
        <div class="audit-banner-av">${esc(initial)}</div>
        <span class="audit-banner-lbl">${esc(label || 'Submitted by')}</span>
        <span class="audit-banner-name">${esc(fullname)}</span>
        ${dateStr ? `<span class="audit-banner-sep">·</span><span class="audit-banner-time">${dateStr}</span>` : ''}
      </div>
      ${lockedPill}
    </div>`;
  el.style.display = 'block';
}

/** Banner timestamp for an action the current user just took. */
export const nowIso = () => new Date().toISOString();
