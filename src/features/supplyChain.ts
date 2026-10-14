/** Tab 2 — Supply Chain: external consumable items and their markup. */
import { DEFAULT_MARKUP_PCT } from '../config';
import { dvDelete, dvList, dvPatch, dvPost } from '../data/dataverse';
import type { ConsumableItemRow } from '../data/rows';
import { consumableFinalCost, roundedConsumableFinalCost } from '../domain/pricing';
import { Status } from '../domain/status';
import { S } from '../state';
import type { ConsumableItem } from '../types';
import { byId, esc, findById } from '../ui/dom';
import { fmt } from '../ui/format';
import { icon } from '../ui/icons';
import { errorMessage, nowIso, renderAuditBanner, setFooter, showTabLoading, showToast, updateStatus } from '../ui/feedback';
import { consumableBody, requestBind, saveRequestRecord, setRequestStatus, validConsumables } from './persistence';
import { completeTabs, goTab, unlockTab } from './tabs';

const ITEMS = 'oprx_consumablesitems';
/** Item name of the empty row created when Tab 1 is submitted. */
const PLACEHOLDER_NAME = 'Pending';

export function addConsumableItem(): void {
  S.consumableItems.push({ idx: Date.now(), name: '', baseCost: 0, markupPct: DEFAULT_MARKUP_PCT, finalCost: 0 });
  renderConsumablesList();
}

export function removeConsumableItem(idx: number): void {
  S.consumableItems = S.consumableItems.filter((i) => i.idx !== idx);
  renderConsumablesList();
  calcScTotal();
}

export function renderConsumablesList(): void {
  const list = byId('consumablesList');
  list.innerHTML = '';
  S.consumableItems.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'consumable-item';
    div.innerHTML = `
      <div class="field"><label>Item Name <span class="req">*</span></label>
        <input type="text" placeholder="e.g. Surgical Mesh" value="${esc(item.name)}" data-onchange="updateConsumable(${item.idx},'name',this.value)"></div>
      <div class="field"><label>Base Cost (EGP)</label>
        <input type="number" min="0" step="any" placeholder="0.00" value="${item.baseCost || ''}" data-onchange="updateConsumable(${item.idx},'baseCost',this.value)"></div>
      <div class="field"><label>Markup %</label>
        <input type="number" min="0" max="100" value="${item.markupPct}" data-onchange="updateConsumable(${item.idx},'markupPct',this.value)"></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.05em;text-transform:uppercase;display:block;margin-bottom:5px;">Final Cost</label>
        <div class="consumable-calc" id="finalCost_${item.idx}">${fmt(item.finalCost)}</div></div>
      <button class="btn-remove" data-onclick="removeConsumableItem(${item.idx})">${icon('trash')}</button>`;
    list.appendChild(div);
  });
}

export function updateConsumable(idx: number, field: 'name' | 'baseCost' | 'markupPct', val: string): void {
  const item = S.consumableItems.find((i) => i.idx === idx);
  if (!item) return;
  if (field === 'name') item.name = val;
  else item[field] = parseFloat(val) || 0;
  item.finalCost = consumableFinalCost(item);
  const el = findById(`finalCost_${idx}`);
  if (el) el.textContent = fmt(item.finalCost);
  calcScTotal();
}

export function calcScTotal(): void {
  S.consumablesTotal = S.consumableItems.reduce((a, i) => a + i.finalCost, 0);
  byId('scTotalVal').textContent = `EGP ${fmt(S.consumablesTotal)}`;
}

/**
 * Created when Tab 1 is submitted with consumables: an empty
 * oprx_consumablesitems row linked to the request that Supply Chain fills in later.
 */
export async function createEmptySupplyChainRecord(): Promise<void> {
  try {
    if (S.supplyChainRecordId) {
      console.log(`[SC] Supply Chain record already exists: ${S.supplyChainRecordId}`);
      return;
    }
    const id = await dvPost(ITEMS, {
      oprx_itemname: PLACEHOLDER_NAME,
      oprx_basecost: 0,
      oprx_markuppct: DEFAULT_MARKUP_PCT,
      oprx_finalcost: 0,
      ...requestBind(),
    });
    if (id) {
      S.supplyChainRecordId = id;
      S.consumableItemIds = [id];
      console.log(`[SC] Empty Supply Chain record created: ${id}`);
    }
  } catch (e) {
    console.warn('[SC] Could not create Supply Chain record:', errorMessage(e));
  }
}

/** Loads saved consumable items; also sets the Tab 2 banner author from the latest edit. */
export async function loadConsumableItems(recordId: string): Promise<void> {
  try {
    const rows = await dvList<ConsumableItemRow>(
      `${ITEMS}?$select=oprx_consumablesitemid,oprx_itemname,oprx_basecost,oprx_markuppct,oprx_finalcost,createdon,modifiedon` +
        `&$expand=createdby($select=fullname),modifiedby($select=fullname)` +
        `&$filter=_oprx_pricingrequestid_value eq ${recordId}&$orderby=createdon asc`,
    );
    if (!rows.length) return;

    // Index-based keys: Date.now()+Math.random() could collide in a tight loop
    S.consumableItems = rows.map(
      (i, n): ConsumableItem => ({
        idx: Date.now() + n * 1000,
        dvId: i.oprx_consumablesitemid,
        name: i.oprx_itemname === PLACEHOLDER_NAME ? '' : i.oprx_itemname || '',
        baseCost: i.oprx_basecost || 0,
        markupPct: i.oprx_markuppct || DEFAULT_MARKUP_PCT,
        finalCost: i.oprx_finalcost || 0,
      }),
    );
    S.consumableItemIds = rows.map((i) => i.oprx_consumablesitemid);
    // The first row is the Supply Chain record created from Tab 1
    S.supplyChainRecordId = rows[0]?.oprx_consumablesitemid || null;
    S.consumablesTotal = S.consumableItems.reduce((a, i) => a + i.finalCost, 0);
    renderConsumablesList();
    calcScTotal();

    // Banner shows the last edit (highest modifiedon), i.e. the closest thing to the actual submit time
    const stamp = (r: ConsumableItemRow) => new Date(r.modifiedon || r.createdon || 0);
    const latest = rows.reduce((a, b) => (stamp(b) > stamp(a) ? b : a), rows[0]);
    const person = latest?.modifiedby?.fullname || latest?.createdby?.fullname;
    if (person) {
      S.tab2BannerAuthor = person;
      S.tab2BannerDate = latest.modifiedon || latest.createdon || null;
    }
    console.log(`[LOAD] ${rows.length} consumable item(s) loaded — SC Record: ${S.supplyChainRecordId}`);
  } catch (e) {
    console.warn('[LOAD] Consumable items failed:', e);
  }
}

export async function completeTab2(): Promise<void> {
  const items = validConsumables();
  if (!items.length) {
    showToast('Please add at least one consumable item.', 'error');
    return;
  }

  showTabLoading(true, 'Saving consumables...');
  try {
    if (!S.recordId) {
      console.log('[TAB2] No recordId — creating request record first...');
      await saveRequestRecord(Status.PendingSupplyChain);
    }
    if (!S.recordId) throw new Error('Could not create or find the pricing request record.');

    if (S.supplyChainRecordId) {
      // Fill the row created from Tab 1 with the first item, then add the rest
      const [first, ...rest] = items;
      await dvPatch(ITEMS, S.supplyChainRecordId, {
        oprx_itemname: first.name,
        oprx_basecost: first.baseCost,
        oprx_markuppct: first.markupPct,
        oprx_finalcost: roundedConsumableFinalCost(first),
      });
      console.log(`[SC] PATCH first item: "${first.name}" → ${S.supplyChainRecordId}`);
      S.consumableItemIds = [S.supplyChainRecordId];
      for (const item of rest) {
        const id = await dvPost(ITEMS, consumableBody(item, roundedConsumableFinalCost(item)));
        if (id) {
          S.consumableItemIds.push(id);
          console.log(`[SC] POST extra item: "${item.name}" → ${id}`);
        }
      }
    } else {
      // No Supply Chain row yet: replace any earlier rows with all items
      for (const id of S.consumableItemIds) await dvDelete(ITEMS, id);
      S.consumableItemIds = [];
      for (const item of items) {
        const id = await dvPost(ITEMS, consumableBody(item, roundedConsumableFinalCost(item)));
        if (id) {
          S.consumableItemIds.push(id);
          console.log(`[SC] POST item: "${item.name}" → ${id}`);
        }
      }
    }

    S.consumablesTotal = items.reduce((a, i) => a + roundedConsumableFinalCost(i), 0);

    await setRequestStatus(S.recordId, Status.PendingBilling);
    console.log('[STATUS] → Pending Billing (129990002)');
    updateStatus('Pending Billing');

    completeTabs(2);
    renderAuditBanner(2, S.currentUserName, nowIso(), 'Submitted by');
    unlockTab(3);
    goTab(3);

    showToast(`${items.length} consumable item(s) saved successfully.`, 'success');
    setFooter('check', 'var(--green)', 'Supply Chain complete — proceed to Billing Review.');
  } catch (e) {
    console.error('[TAB2 ERROR]', e);
    showToast('Save failed: ' + (errorMessage(e) || 'Unknown error'), 'error');
  } finally {
    showTabLoading(false);
  }
}
