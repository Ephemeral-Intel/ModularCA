// Every direct localStorage.getItem('authToken') call now
// routes through the api/client.ts getToken helper so a future cookie-based
// auth migration is a one-line change. Do not re-introduce localStorage reads
// here.
import { getToken as clientGetToken, clearTokens } from '../api/client';

export function isAuthenticated(): boolean {
    const token = clientGetToken();
    const expiresAt = localStorage.getItem('expiresAt');

    if (!token || !expiresAt) return false;

    const now = new Date();
    const exp = new Date(expiresAt);

    return now < exp;
}

export function getToken(): string | null {
    return clientGetToken();
}

export function isMfaSetupRequired(): boolean {
    return localStorage.getItem('mfaSetupRequired') === 'true';
}

export function setMfaSetupRequired(required: boolean) {
    if (required) localStorage.setItem('mfaSetupRequired', 'true');
    else localStorage.removeItem('mfaSetupRequired');
}

export function logout() {
    clearTokens();
    window.location.href = '/admin/login';
}
