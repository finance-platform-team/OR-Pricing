/** App-wide configuration values. */

/** Power Automate HTTP trigger that runs the DotCare pricing stored procedure. The `sig` query param is its auth. */
export const FLOW_URL =
  'https://931476765995ec97896bdf8b57b25e.4d.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/5a55535df3bd4134a642501e77079075/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=0t4wj7bNYP9I9mP5Y6gJPLGx-u2bv659OrO-HhUJcNc';

/** Largest file accepted for the Insurance Card / OR Referral columns. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024; // 32 MB

/** Share of the base cost charged as service fees. */
export const SERVICE_FEE_RATE = 0.15;

/** Cost share of the primary procedure vs. each secondary one (percent). */
export const PRIMARY_COST_PCT = 100;
export const SECONDARY_COST_PCT = 50;

/** Default markup for a new consumable item (percent). */
export const DEFAULT_MARKUP_PCT = 20;

/** Row caps for the list and compliance queries. */
export const LIST_TOP = 200;
export const COMPLIANCE_TOP = 500;
export const PATIENTS_TOP = 500;
