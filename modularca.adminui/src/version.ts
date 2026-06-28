import { apiGet } from './api/client';

/**
 * Build-time provenance of this UI bundle, injected by Vite from the repo-root VERSION file plus git
 * (see vite.config.ts). The `typeof` guards keep these safe in any context where the Vite `define`
 * wasn't applied (e.g. unit tests) — they resolve to placeholders instead of throwing.
 */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT: string = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown';
export const APP_BUILD_TIME: string = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';

export interface ServerVersion {
    version: string;
    commit: string;
    buildTime: string | null;
}

/**
 * Fetches the running backend's version + provenance (authenticated). Because both the backend and
 * this UI read the same repo-root VERSION file at build time, a mismatch between {@link APP_VERSION}
 * and the value returned here means the deployed UI and API were built from different versions
 * (deploy drift). Returns null if the request fails.
 */
export async function fetchServerVersion(): Promise<ServerVersion | null> {
    try {
        return await apiGet<ServerVersion>('/api/v1/version');
    } catch {
        return null;
    }
}

/** True when the UI bundle and the running backend report different versions (deploy drift). */
export function isVersionDrift(server: ServerVersion | null): boolean {
    return server != null && server.version !== APP_VERSION;
}
