/**
 * Dataverse adapter for the OR Pricing code app.
 *
 * The original web resource talked to Dataverse with raw fetch() calls against
 * /api/data/v9.2 using OData query strings. Code apps can't do that (CSP
 * connect-src 'none', no Xrm context).
 *
 * The app is hosted in one environment (org998df960) while its tables live in
 * another (DATA_ORG_URL). The per-table generated services always hit the
 * app's home environment, so every call goes through the generic Dataverse
 * connector's *WithOrganization operations instead (added with
 * `pa app add data-source --connector shared_commondataserviceforapps`), which
 * take the target environment URL on each call.
 *
 * The exported functions keep the Web API shapes the original web resource
 * used (dvGet / dvPost / dvPatch / dvDelete ...), so OData query strings carry over as-is.
 */
import { getContext } from '@microsoft/power-apps/app';
import { MicrosoftDataverseService as DV } from '../generated/services/MicrosoftDataverseService';

/** Environment that holds the oprx_* tables. Must be the full https URL. */
export const DATA_ORG_URL = 'https://org319b4ea9.crm4.dynamics.com';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
export type ODataList<T> = { value: T[] };
type Result<T> = { success: boolean; data: T; error?: { message?: string } | unknown };

const ACCEPT = 'application/json';
const PREFER_WRITE = 'return=representation';
/** Formatted values + lookup annotations, like the old services returned; 5000 is Dataverse's page cap. */
const PREFER_READ = 'odata.include-annotations="*",odata.maxpagesize=5000';

/** Entity set name → primary key column */
const PRIMARY_KEYS: Record<string, string> = {
  crd04_specialtieses: 'crd04_specialtiesid',
  opd_patients: 'opd_patientid',
  oprx_accommodationtypes: 'oprx_accommodationtypeid',
  oprx_approvallogs: 'oprx_approvallogid',
  oprx_consumablesitems: 'oprx_consumablesitemid',
  oprx_contracts: 'oprx_contractid',
  oprx_orinfoqueries: 'oprx_orinfoqueryid',
  oprx_pricingoutputs: 'oprx_pricingoutputid',
  oprx_pricingrequests: 'oprx_pricingrequestid',
  oprx_procedurecostings: 'oprx_procedurecostingid',
  oprx_procedures: 'oprx_procedureid',
  oprx_statusauditlogs: 'oprx_statusauditlogid',
  systemusers: 'systemuserid',
};

function primaryKey(set: string): string {
  return PRIMARY_KEYS[set] ?? `${set.replace(/e?s$/, '')}id`;
}

function cleanId(id: string): string {
  return id.replace(/[{}]/g, '');
}

function unwrap<T>(res: Result<T>, what: string): T {
  if (!res.success) {
    const err = res.error as { message?: string } | undefined;
    const msg = err?.message || JSON.stringify(res.error) || 'Unknown error';
    console.error(`[DV ERROR] ${what}`, msg);
    throw new Error(msg);
  }
  return res.data;
}

/**
 * The connector's @odata.nextLink points at its own nextLink endpoint, with the
 * real Dataverse continuation URL-encoded inside a `next` parameter.
 */
function skipTokenFrom(nextLink: string | undefined): string | undefined {
  if (!nextLink) return undefined;
  try {
    const outer = new URL(nextLink);
    const inner = outer.searchParams.get('next') ?? nextLink;
    const q = inner.indexOf('?');
    if (q === -1) return undefined;
    return new URLSearchParams(inner.substring(q + 1)).get('$skiptoken') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * GET with an OData path, e.g.
 *   "oprx_contracts?$select=a,b&$filter=...&$orderby=x asc&$top=10&$expand=createdby($select=fullname)"
 *   "oprx_pricingrequests(<id>)?$select=..."
 * Returns { value: [...] } for collections and the row itself for single records,
 * exactly like the Web API did. `T` is the caller's view of that payload.
 */
export async function dvGet<T = any>(ep: string): Promise<T> {
  const m = ep.trim().match(/^(\w+)(?:\(([^)]+)\))?(?:\?(.*))?$/s);
  if (!m) throw new Error(`Unsupported Dataverse query: ${ep}`);
  const [, set, id, query = ''] = m;
  const params: Record<string, string> = {};
  for (const part of query.split(/&(?=\$)/)) {
    if (!part) continue;
    const eq = part.indexOf('=');
    params[part.slice(0, eq).toLowerCase()] = part.slice(eq + 1);
  }
  const select = params.$select || undefined;
  const expand = params.$expand || undefined;

  if (id) {
    return unwrap(
      await DV.GetItemWithOrganization(
        PREFER_READ, ACCEPT, DATA_ORG_URL, set, cleanId(id), undefined, undefined, select, expand,
      ),
      `GET ${set}(${id})`,
    ) as T;
  }

  // $top means "this is all I want" — Dataverse then returns no nextLink.
  // Without it, follow the nextLink so tables over 5000 rows aren't silently cut off.
  const top = params.$top ? Number(params.$top) : undefined;
  const rows: Row[] = [];
  let skiptoken: string | undefined;
  do {
    const page = unwrap(
      await DV.ListRecordsWithOrganization(
        DATA_ORG_URL, set, PREFER_READ, ACCEPT, undefined, undefined,
        select, params.$filter || undefined, params.$orderby || undefined, expand,
        undefined, top, skiptoken,
      ),
      `GET ${set}`,
    ) as Row;
    rows.push(...((page.value as Row[]) ?? []));
    skiptoken = top ? undefined : skipTokenFrom(page['@odata.nextLink']);
  } while (skiptoken);
  return { value: rows } as T;
}

/** GET a collection and return its rows. */
export async function dvList<T>(ep: string): Promise<T[]> {
  return (await dvGet<ODataList<T>>(ep)).value ?? [];
}

/** Value for a `<navProp>@odata.bind` key, e.g. odataRef('oprx_contracts', id) → "/oprx_contracts(id)". */
export function odataRef(set: string, id: string): string {
  return `/${set}(${id})`;
}

/** Creates a record and returns its id (like reading the OData-EntityId header). */
export async function dvPost(set: string, body: Row): Promise<string | null> {
  try {
    const res = (await DV.CreateRecordWithOrganization(PREFER_WRITE, ACCEPT, DATA_ORG_URL, set, body)) as unknown as Result<Row>;
    const created = unwrap(res, `POST ${set}`);
    return created?.[primaryKey(set)] ?? null;
  } catch (e) {
    console.error('[DV POST BODY]', JSON.stringify(body, null, 2));
    throw e;
  }
}

export async function dvPatch(set: string, id: string, body: Row): Promise<void> {
  unwrap(
    await DV.UpdateRecordWithOrganization(PREFER_WRITE, ACCEPT, DATA_ORG_URL, set, cleanId(id), body),
    `PATCH ${set}(${id})`,
  );
}

/** Deletes a record; failures (e.g. already deleted) are only logged, as before. */
export async function dvDelete(set: string, id: string): Promise<void> {
  try {
    unwrap(await DV.DeleteRecordWithOrganization(DATA_ORG_URL, set, cleanId(id)), `DELETE ${set}(${id})`);
  } catch (e) {
    console.warn(`[DV DELETE] ${set}(${id}) →`, e);
  }
}

/** Sets a single-valued lookup (replaces the old PUT .../$ref call). */
export async function dvSetLookup(
  set: string,
  id: string,
  navProp: string,
  relatedSet: string,
  relatedId: string,
): Promise<void> {
  await dvPatch(set, id, { [`${navProp}@odata.bind`]: `/${relatedSet}(${cleanId(relatedId)})` });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function dvUploadFile(set: string, id: string, column: string, file: File): Promise<void> {
  // The SDK decodes base64 for `format: binary` bodies, sends raw bytes and adds its own
  // Content-Type: application/octet-stream. Passing content-type as well (even the same
  // value) merges into two media types, which Dataverse rejects (0x80048d19), so it is
  // left undefined — the SDK omits undefined header params.
  const content = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  unwrap(
    await DV.UpdateEntityFileImageFieldContentWithOrganization(
      undefined as unknown as string, DATA_ORG_URL, set, cleanId(id), column, content, file.name,
    ),
    `UPLOAD ${set}(${id})/${column}`,
  );
}

export async function dvDownloadFile(
  set: string,
  id: string,
  column: string,
): Promise<{ bytes: Uint8Array; fileName?: string }> {
  // The file name lives in the "<column>_name" attribute of the row.
  const [res, meta] = await Promise.all([
    DV.GetEntityFileImageFieldContentWithOrganization('bytes=0-', DATA_ORG_URL, set, cleanId(id), column, 'full'),
    dvGet(`${set}(${cleanId(id)})?$select=${column}_name`).catch(() => null),
  ]);
  const data = unwrap(res as Result<unknown>, `DOWNLOAD ${set}(${id})/${column}`);
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) bytes = data;
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
  else if (typeof data === 'string') bytes = base64ToBytes(data);
  else if (data && typeof (data as Row).$content === 'string') bytes = base64ToBytes((data as Row).$content);
  else throw new Error(`Unexpected file download payload for ${set}(${id})/${column}`);
  return { bytes, fileName: meta?.[`${column}_name`] ?? undefined };
}

let ctxPromise: ReturnType<typeof getContext> | null = null;
function ctx() {
  ctxPromise ??= getContext();
  return ctxPromise;
}

/**
 * Signed-in user (replaces Xrm.Utility.getGlobalContext() / WhoAmI).
 * The context's systemUserId belongs to the app's home environment, and
 * systemuser ids differ per environment, so the user is looked up in the
 * data environment by Entra object id.
 */
export async function getCurrentUser(): Promise<{ id: string | null; name: string }> {
  const { user } = await ctx();
  let id: string | null = null;
  let name = user.fullName ?? '';
  if (user.objectId) {
    const d = await dvGet(
      `systemusers?$select=systemuserid,fullname&$filter=azureactivedirectoryobjectid eq ${user.objectId}&$top=1`,
    );
    id = d.value?.[0]?.systemuserid ?? null;
    name ||= d.value?.[0]?.fullname ?? '';
  }
  if (!id) console.warn(`[USER] No systemuser for this user in ${DATA_ORG_URL}`);
  return { id: id ? cleanId(id).toLowerCase() : null, name: name || 'User' };
}

/**
 * The player passes launch params (e.g. ?id=<guid>&view=compliance) through the
 * app context rather than the iframe URL. Copy the ones the router reads into
 * the URL once, so the legacy router and back/forward handling work unchanged.
 */
export async function applyLaunchParams(): Promise<void> {
  try {
    // Don't hold up startup if the host never answers (e.g. opened outside the player)
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 5000));
    const launch = (await Promise.race([ctx(), timeout])).app.queryParams ?? {};
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ['id', 'recordId', 'view']) {
      const val = Object.entries(launch).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
      if (val && !url.searchParams.has(key)) {
        url.searchParams.set(key, val);
        changed = true;
      }
    }
    if (changed) history.replaceState(history.state, '', url);
  } catch (e) {
    console.warn('[CTX] Could not read launch params:', e);
  }
}
