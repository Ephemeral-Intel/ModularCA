import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPut } from '../api/client';

/**
 * Per-user UI preference persistence with a two-tier strategy:
 *   - localStorage is the instant, per-browser fast path (read synchronously on mount).
 *   - the backend (/api/v1/me/preferences) is the cross-device source of truth, fetched once
 *     per session and used to hydrate a browser that has no local copy yet.
 *
 * Every update writes BOTH layers. On a browser that already has a local value we keep using it
 * (it's this browser's latest); the backend copy seeds new browsers/devices. This favours instant
 * local response while still syncing layouts across devices the first time they're opened.
 */

const LS_PREFIX = 'modca:pref:';

// Session-wide cache of the backend preferences map so N tables don't each hit the endpoint.
let backendCache: Record<string, any> | null = null;
let backendPromise: Promise<Record<string, any>> | null = null;

function loadBackendPrefs(): Promise<Record<string, any>> {
    if (backendCache) return Promise.resolve(backendCache);
    if (!backendPromise) {
        backendPromise = apiGet<Record<string, any>>('/api/v1/me/preferences')
            .then((data) => { backendCache = data || {}; return backendCache; })
            .catch(() => { backendCache = {}; return backendCache!; });
    }
    return backendPromise;
}

/**
 * Reads/writes a single namespaced preference (e.g. "table:certificates").
 * @param key   Stable, app-defined key. Use a "namespace:id" form.
 * @param defaults Shape returned before anything is stored; stored partials are shallow-merged over it.
 */
export function useTablePrefs<T extends object>(key: string, defaults: T): [T, (next: T) => void] {
    const lsKey = LS_PREFIX + key;

    const [value, setValue] = useState<T>(() => {
        try {
            const raw = localStorage.getItem(lsKey);
            if (raw) return { ...defaults, ...JSON.parse(raw) };
        } catch { /* ignore malformed local copy */ }
        return defaults;
    });

    // Whether this browser already had a stored copy (then local wins over backend hydrate).
    const hadLocal = useRef<boolean>(false);
    useEffect(() => {
        try { hadLocal.current = localStorage.getItem(lsKey) != null; } catch { /* ignore */ }
    }, [lsKey]);

    // One-time backend hydrate for browsers without a local copy.
    const hydrated = useRef(false);
    useEffect(() => {
        let cancelled = false;
        loadBackendPrefs().then((all) => {
            if (cancelled || hydrated.current) return;
            hydrated.current = true;
            const remote = all[key];
            if (remote && !hadLocal.current) setValue({ ...defaults, ...remote });
        });
        return () => { cancelled = true; };
        // defaults intentionally excluded — it's a fresh object literal each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const update = useCallback((next: T) => {
        setValue(next);
        try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* quota/private mode */ }
        hadLocal.current = true;
        if (backendCache) backendCache[key] = next;
        // Fire-and-forget cross-device sync; failure is non-fatal (localStorage still holds it).
        apiPut(`/api/v1/me/preferences/${encodeURIComponent(key)}`, next as object).catch(() => { /* offline ok */ });
    }, [key, lsKey]);

    return [value, update];
}
