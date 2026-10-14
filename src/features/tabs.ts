/** Tab navigation for the request form (1 Request · 2 Supply Chain · 3 Billing Review · 4 Cost & Pricing · 5 Approval). */
import { S } from '../state';
import type { TabNumber } from '../types';
import { byId, findById, valueOf } from '../ui/dom';
import { populateBillingReviewTab } from './billingReview';
import { calculateAll } from './costing';
import { updateOrReplyButtonVisibility } from './orQuery';

export function goTab(n: TabNumber): void {
  if (!S.unlockedTabs.includes(n)) return;
  S.currentTab = n;
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  byId(`tabPanel${n}`).classList.add('active');
  // "done" stays — "active" only adds the underline on top
  byId(`tabBtn${n}`).classList.add('active');

  if (n === 2) showConsumablesDescription();
  // "View OR Coordinator's Reply" only shows on the Supply Chain tab
  updateOrReplyButtonVisibility();
  if (n === 3) populateBillingReviewTab();
  // Recalculate so Doctor Fee / Extra Fees edited in Billing Review show up immediately
  if (n === 4 && S.costsLoaded) calculateAll();
}

/** "Back" on the Billing tab. */
export function goTabPrev(): void {
  goTab(S.hasConsumables ? 2 : 1);
}

/** Shows the OR Coordinator's consumables description on the Supply Chain tab. */
function showConsumablesDescription(): void {
  const desc = valueOf('fConsumablesDesc').trim();
  const box = findById('scDescBox');
  const text = findById('scDescText');
  if (desc && box && text) {
    text.textContent = desc;
    box.style.display = 'block';
  } else if (box) {
    box.style.display = 'none';
  }
}

export function unlockTab(n: TabNumber): void {
  if (S.unlockedTabs.includes(n)) return;
  S.unlockedTabs.push(n);
  byId(`tabBtn${n}`).classList.remove('locked');
}

export function markTabDone(n: TabNumber): void {
  const btn = byId(`tabBtn${n}`);
  btn.classList.remove('active', 'rejected');
  btn.classList.add('done');
}

export function markTabRejected(n: TabNumber): void {
  const btn = byId(`tabBtn${n}`);
  btn.classList.remove('active', 'done');
  btn.classList.add('rejected');
}

/** Makes a tab's panel read-only. */
export function freezeTab(n: TabNumber): void {
  findById(`tabPanel${n}`)?.classList.add('tab-frozen');
}

export function unfreezeTab(n: TabNumber): void {
  findById(`tabPanel${n}`)?.classList.remove('tab-frozen');
}

/** Marks tabs as completed and read-only. */
export function completeTabs(...tabs: TabNumber[]): void {
  for (const n of tabs) {
    markTabDone(n);
    freezeTab(n);
  }
}
