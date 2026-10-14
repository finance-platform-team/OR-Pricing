/** Choice values (oprx_status and related option sets) and how they are displayed. */

export const Status = {
  Draft: 129990000,
  PendingSupplyChain: 129990001,
  PendingBilling: 129990002,
  PendingApproval: 129990003,
  Approved: 129990004,
  Rejected: 129990005,
  PendingOrInfo: 129990006,
} as const;
export type StatusCode = (typeof Status)[keyof typeof Status];

/** oprx_orinfoqueries.oprx_querystatus */
export const QueryStatus = { Open: 129990000, Answered: 129990001 } as const;

/** oprx_approvallogs.oprx_decision */
export const Decision = { Approved: 129990000, Rejected: 129990001 } as const;

/** oprx_pricingoutputs.oprx_outputstatus */
export const OutputStatus = { PendingApproval: 129990000, Approved: 129990001, Rejected: 129990002 } as const;

export const STATUS_LABEL: Record<number, string> = {
  [Status.Draft]: 'Draft',
  [Status.PendingSupplyChain]: 'Pending Supply Chain',
  [Status.PendingBilling]: 'Pending Billing',
  [Status.PendingApproval]: 'Pending Approval',
  [Status.Approved]: 'Approved',
  [Status.Rejected]: 'Rejected',
  [Status.PendingOrInfo]: 'Pending OR Info',
};

export function getStatusLabel(status: number | null | undefined): string {
  return (status != null && STATUS_LABEL[status]) || 'Draft';
}

/** Approved / Rejected — the request is closed. */
export function isTerminalStatus(status: number | null | undefined): boolean {
  return status === Status.Approved || status === Status.Rejected;
}

/** CSS modifier for .status-badge in the list and compliance tables. */
export const STATUS_CLASS: Record<number, string> = {
  [Status.Draft]: 'draft',
  [Status.PendingSupplyChain]: 'supply-chain',
  [Status.PendingBilling]: 'billing',
  [Status.PendingApproval]: 'approval',
  [Status.Approved]: 'approved',
  [Status.Rejected]: 'rejected',
  [Status.PendingOrInfo]: 'or-info',
};

export const STATUS_DOT_COLOR: Record<number, string> = {
  [Status.Draft]: 'var(--text3)',
  [Status.PendingSupplyChain]: 'var(--amber)',
  [Status.PendingBilling]: 'var(--blue)',
  [Status.PendingApproval]: 'var(--purple)',
  [Status.Approved]: 'var(--green)',
  [Status.Rejected]: 'var(--red)',
  [Status.PendingOrInfo]: 'var(--red)',
};

/** Header status pill styles, keyed by label. */
export const STATUS_PILL_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'Draft': { bg: 'var(--brand-light)', color: 'var(--brand-dark)', border: '1px solid rgba(165,116,77,.25)' },
  'Pending Supply Chain': { bg: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-bdr)' },
  'Pending Billing': { bg: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-bdr)' },
  'Pending Approval': { bg: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-bdr)' },
  'Approved': { bg: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' },
  'Rejected': { bg: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bdr)' },
  'Pending OR Info': { bg: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bdr)' },
};

/* ── Audit trail / compliance: which team owns each status ──
   "Pending Approval" still counts as Billing: the Billing Team owns the
   request until an actual Approve/Reject decision is made. */
export type Team = 'Draft' | 'Supply Chain' | 'Billing' | 'OR Coordinator';

export const TEAM_OF_STATUS: Record<number, Team> = {
  [Status.Draft]: 'Draft',
  [Status.PendingSupplyChain]: 'Supply Chain',
  [Status.PendingBilling]: 'Billing',
  [Status.PendingApproval]: 'Billing',
  [Status.Approved]: 'Billing',
  [Status.Rejected]: 'Billing',
  [Status.PendingOrInfo]: 'OR Coordinator',
};

export const TEAM_COLOR: Record<string, string> = {
  'Draft': 'var(--text3)',
  'Supply Chain': 'var(--amber)',
  'Billing': 'var(--blue)',
  'OR Coordinator': 'var(--red)',
};

/** Timeline dot colour only (marks the approval stage visually) — doesn't affect team totals. */
export const AUDIT_DOT_COLOR_OVERRIDE: Record<number, string> = {
  [Status.PendingApproval]: 'var(--purple)',
  [Status.Approved]: 'var(--purple)',
  [Status.Rejected]: 'var(--purple)',
};
