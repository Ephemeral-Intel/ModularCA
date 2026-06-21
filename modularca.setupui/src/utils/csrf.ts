/// Reads the CSRF-TOKEN cookie and returns it for use in X-CSRF-Token header.
export function getCsrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
}

/// Returns headers object with CSRF token included.
export function csrfHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
        ...extra,
    };
}
