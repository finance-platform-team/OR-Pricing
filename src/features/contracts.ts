/** Contract search on Tab 1 and on Billing Review (over the selected hospital's contracts). */
import { S } from '../state';
import type { Contract } from '../types';
import { highlight } from '../ui/dom';
import { clearFieldError } from '../ui/feedback';
import { createSearchPicker, type SearchPickerConfig } from '../ui/searchPicker';

const common: Pick<
  SearchPickerConfig<Contract>,
  'noun' | 'selectedWeight' | 'showAllOnFocus' | 'source' | 'matches' | 'renderOption' | 'idOf' | 'labelOf'
> = {
  noun: 'contracts',
  selectedWeight: '600',
  showAllOnFocus: true,
  source: () => S.contractsCache || [],
  matches: (c, q) => c.name.toLowerCase().includes(q),
  renderOption: (c, q) => `<div class="patient-option-name">${highlight(c.name, q)}</div>`,
  idOf: (c) => c.id,
  labelOf: (c) => c.name,
};

const contractPicker = createSearchPicker<Contract>({
  ...common,
  input: 'contractSearchInput',
  hidden: 'fContract',
  dropdown: 'contractDropdown',
  clearBtn: 'contractClearBtn',
  wrap: 'contractSearchWrap',
  onSelect: (c) => {
    clearFieldError('fieldContract');
    console.log(`[CONTRACT] Selected: ${c.name} (${c.id})`);
  },
});

const billingContractPicker = createSearchPicker<Contract>({
  ...common,
  input: 'billingContractSearchInput',
  hidden: 'fBillingContract',
  dropdown: 'billingContractDropdown',
  clearBtn: 'billingContractClearBtn',
  wrap: 'billingContractSearchWrap',
});

export const onContractSearch = (query: string) => contractPicker.search(query);
export const showContractDropdown = () => contractPicker.focus();
export const selectContract = (c: Contract) => contractPicker.select(c);
export const clearContract = () => contractPicker.clear();

export const onBillingContractSearch = (query: string) => billingContractPicker.search(query);
export const showBillingContractDropdown = () => billingContractPicker.focus();
export const selectBillingContract = (c: Contract) => billingContractPicker.select(c);
export const clearBillingContract = () => billingContractPicker.clear();

export function installContractPickers(): void {
  contractPicker.install();
  billingContractPicker.install();
}
