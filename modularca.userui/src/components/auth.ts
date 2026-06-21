export function isAuthenticated(): boolean {
    const token = localStorage.getItem('authToken');
    const expiresAt = localStorage.getItem('expiresAt');

    if (!token || !expiresAt) return false;

    const now = new Date();
    const exp = new Date(expiresAt);

    return now < exp;
}

export function getToken(): string | null {
    return localStorage.getItem('authToken');
}

export function isMfaSetupRequired(): boolean {
    return localStorage.getItem('mfaSetupRequired') === 'true';
}

export function setMfaSetupRequired(required: boolean) {
    if (required) localStorage.setItem('mfaSetupRequired', 'true');
    else localStorage.removeItem('mfaSetupRequired');
}

export function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('expiresAt');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('mfaSetupRequired');
    window.location.href = '/user/login';
}
