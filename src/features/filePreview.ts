/** Preview of the Insurance Card / OR Referral files saved on the request. */
import { dvDownloadFile } from '../data/dataverse';
import { S } from '../state';
import { byId, esc, findById } from '../ui/dom';
import { errorMessage } from '../ui/feedback';
import { ICON_PATHS } from '../ui/icons';

const MODAL = 'filePreviewModal';

/** Releases blob: URLs held by the modal's previous content. */
function revokeBlobUrls(modal: HTMLElement): void {
  const urls = [
    modal.querySelector('iframe')?.src,
    modal.querySelector('img')?.src,
    modal.querySelector<HTMLAnchorElement>('a[download]')?.href,
  ];
  for (const url of urls) if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** Detects the image type from the file's magic bytes ("" when not a known image). */
function imageMimeOf(sig: string): string {
  if (sig.startsWith('89504e47')) return 'image/png';
  if (sig.startsWith('ffd8ff')) return 'image/jpeg';
  if (sig.startsWith('47494638')) return 'image/gif';
  if (sig.startsWith('424d')) return 'image/bmp';
  if (sig === '52494646') return 'image/webp';
  return '';
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export async function previewFile(column: string, label: string): Promise<void> {
  if (!S.recordId) return;
  const modal = byId(MODAL);
  const body = byId('fileModalBody');
  revokeBlobUrls(modal);

  byId('fileModalTitle').textContent = label;
  body.innerHTML = `
    <div class="file-modal-loading">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS.spinner}</svg>
      Loading file...
    </div>`;
  modal.style.display = 'flex';

  try {
    // The code-app CSP allows data: (not blob:) for img/object, so the preview uses data: URLs
    const file = await dvDownloadFile('oprx_pricingrequests', S.recordId, column);
    const bytes = file.bytes;

    const shownName = findById(column === 'oprx_insurancecard' ? 'insuranceFileName' : 'referralFileName')?.textContent || '';
    const fname = ((file.fileName || '') + ' ' + shownName).toLowerCase();
    const sig = Array.from(bytes.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const isPdf = sig === '25504446' || fname.includes('.pdf');
    const imgMime = imageMimeOf(sig);
    const isImage = !!imgMime || /\.(png|jpg|jpeg|gif|webp|bmp)(\s|✓)?/i.test(fname);
    const blob = new Blob([bytes as BlobPart], { type: isPdf ? 'application/pdf' : imgMime || 'image/*' });
    const dataUrl = await toDataUrl(blob);

    if (isPdf) {
      body.innerHTML = `<object data="${dataUrl}" type="application/pdf" style="width:100%;height:100%;border:none;"></object>`;
    } else {
      // Unknown types are still tried as an image, with a download link on failure
      body.innerHTML = `<img src="${dataUrl}" alt="${esc(label)}" style="max-width:100%;max-height:100%;object-fit:contain;padding:16px;">`;
      if (!isImage) {
        body.querySelector('img')?.addEventListener('error', () => {
          const downloadUrl = URL.createObjectURL(blob);
          const name = (file.fileName || label).replace(/"/g, '');
          body.innerHTML = `<div class="file-modal-error">Cannot preview this file.<br><a href="${downloadUrl}" download="${esc(name)}" style="color:var(--brand);">Download file</a></div>`;
        });
      }
    }
  } catch (e) {
    console.error('[PREVIEW ERROR]', e);
    body.innerHTML = `<div class="file-modal-error">Failed to load file.<br><small style="color:var(--text3);">${esc(errorMessage(e))}</small></div>`;
  }
}

/** Closes on the close button, a backdrop click or Escape. */
export function closeFilePreview(event?: Event | { target: EventTarget | null }): void {
  const modal = byId(MODAL);
  if (event && event.target !== modal) return;
  modal.style.display = 'none';
  revokeBlobUrls(modal);
  byId('fileModalBody').innerHTML = '';
}

export function installFilePreviewListeners(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFilePreview({ target: findById(MODAL) });
  });
}
