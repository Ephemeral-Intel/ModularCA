import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiGet, getToken } from '../api/client';

/**
 * Shape returned by GET /api/v1/me. The SPA uses this
 * instead of decoding the JWT body to learn the current identity, group memberships,
 * and effective scopes for ProtectedRoute and Layout sidenav gating.
 */
export interface AuthGroup {
    id: string;
    name: string;
    displayName: string;
    templateName: string | null; // 'Administrator' | 'Operator' | 'Auditor' | 'Requester' | null (custom)
    isSystemGroup: boolean;
    certificateAuthorityId: string | null;
    caLabel: string | null;
    tenantId: string;
}

export interface AuthMeResponse {
    id: string;
    username: string;
    email: string | null;
    displayName: string | null;
    firstName: string;
    lastName: string;
    isActive: boolean;
    groups: AuthGroup[];
    scopes: string[];
    mfa: {
        configured: boolean;
        totp: boolean;
        webauthn: boolean;
        mtls: boolean;
    };
    tenantId: string | null;
}

export interface AuthContextValue {
    user: AuthMeResponse | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    /**
     * Returns true if the user has any of the listed role levels (case-insensitive).
     * A SystemAdmin satisfies any role; a system-level role satisfies the same role
     * scoped to any CA.
     */
    hasAnyRole: (roles: string[]) => boolean;
    /**
     * Returns true if the user has access to the given scope string.
     * Scope formats: "system:Admin", "ca:<id>:Operator", or just "Admin" for any-CA.
     */
    hasScope: (scope: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    error: null,
    refresh: async () => { },
    hasAnyRole: () => false,
    hasScope: () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthMeResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!getToken()) {
            setUser(null);
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const me = await apiGet<AuthMeResponse>('/api/v1/me');
            setUser(me);
            setError(null);
        } catch (e: any) {
            setUser(null);
            setError(e?.message || 'Failed to load user');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const hasAnyRole = useCallback((roles: string[]) => {
        if (!user) return false;
        if (!roles || roles.length === 0) return true;
        const wanted = new Set(roles.map(r => r.toLowerCase()));
        // SystemAdmin is treated as a wildcard for client-side gating; the server
        // remains the authoritative check, but UX should not deny a system admin
        // a page they will succeed on at the server.
        const isSystemAdmin = user.groups.some(g => g.isSystemGroup && g.templateName?.toLowerCase() === 'administrator');
        if (isSystemAdmin) return true;
        return user.groups.some(g => g.templateName != null && wanted.has(g.templateName.toLowerCase()));
    }, [user]);

    const hasScope = useCallback((scope: string) => {
        if (!user) return false;
        if (!scope) return true;
        const lc = scope.toLowerCase();
        if (user.scopes.some(s => s.toLowerCase() === lc)) return true;
        // bare role string like "Admin" — match any system: or ca: scope ending in that role
        if (!lc.includes(':')) {
            return user.scopes.some(s => s.toLowerCase().endsWith(`:${lc}`));
        }
        return false;
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, loading, error, refresh, hasAnyRole, hasScope }}>
            {children}
        </AuthContext.Provider>
    );
};
