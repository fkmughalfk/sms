/** Global API prefix (spec §7). The web app reaches it through the `/api/*` rewrite. */
export const API_PREFIX = 'api/v1';

/** Business timezone for "today" and month boundaries (CLAUDE.md rule 9). */
export const BUSINESS_TIMEZONE = 'Asia/Karachi';

/** Settings default commission (0.35%) — used when no Setting row exists yet. */
export const DEFAULT_COMMISSION_RATE = '0.0035';
