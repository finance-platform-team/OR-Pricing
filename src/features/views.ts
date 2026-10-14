/** Top-level views: request list, request form, compliance dashboard. */
import { byId } from '../ui/dom';
import { formatDate } from '../ui/format';

type View = 'list' | 'form' | 'compliance';

function showView(view: View): void {
  byId('listView').style.display = view === 'list' ? 'block' : 'none';
  byId('formView').style.display = view === 'form' ? 'block' : 'none';
  byId('complianceView').style.display = view === 'compliance' ? 'block' : 'none';
  byId('globalStatus').style.display = view === 'form' ? 'inline-flex' : 'none';
}

export function showListView(): void {
  showView('list');
  byId('listCurrentDate').textContent = formatDate(new Date());
}

export function showFormView(): void {
  showView('form');
  byId('currentDate').textContent = formatDate(new Date());
}

export function showComplianceView(): void {
  showView('compliance');
}
