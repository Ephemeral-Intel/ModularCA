import React, { useState, useEffect } from 'react';
import { apiGet, API_BASE } from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sshCertStatus(cert: any): 'active' | 'revoked' | 'expired' {
    if (cert.isRevoked) return 'revoked';
    if (new Date(cert.validBefore) < new Date()) return 'expired';
    return 'active';
}

function statusBadgeType(s: string): 'active' | 'disabled' | 'pending' {
    if (s === 'active') return 'active';
    if (s === 'revoked') return 'disabled';
    return 'pending';
}

interface SshCertificate {
    id: string;
    serialNumber: string;
    keyId: string;
    // Backend stores principals as a JSON-encoded string (e.g. '["alice","bob"]').
    // Tolerate the string form and also accept a real array in case the projection
    // is ever changed server-side.
    principals: string | string[];
    validAfter: string;
    validBefore: string;
    isRevoked: boolean;
    sshCaKeyId: string;
}

function formatPrincipals(raw: string | string[] | null | undefined): string {
    if (raw == null) return '-';
    if (Array.isArray(raw)) return raw.length === 0 ? '-' : raw.join(', ');
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '[]') return '-';
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.length === 0 ? '-' : parsed.join(', ');
    } catch {
        // Not JSON — fall back to the raw string.
    }
    return trimmed;
}

const MySshCertificates: React.FC = () => {
    const { showToast } = useToast();
    const [certificates, setCertificates] = useState<SshCertificate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [endpointUnavailable, setEndpointUnavailable] = useState(false);

    useEffect(() => {
        apiGet<SshCertificate[]>('/api/v1/user/ssh/certificates')
            .then((data) => setCertificates(Array.isArray(data) ? data : []))
            .catch((err) => {
                if (err.message?.includes('404') || err.message?.includes('Not Found')) {
                    setEndpointUnavailable(true);
                } else {
                    setError(err.message);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const handleDownload = async (cert: SshCertificate) => {
        try {
            const resp = await fetch(`${API_BASE}/api/v1/user/ssh/certificates/${cert.id}/download`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const text = await resp.text();
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${cert.keyId || cert.id}-cert.pub`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            showToast('error', err.message || 'Download failed');
        }
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SSH Certificates</h1>

            {loading && <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>}
            {error && <p className="text-sm text-red-800 dark:text-red-400">{error}</p>}

            {endpointUnavailable && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                    <p className="text-gray-600">SSH certificates will appear here once issued.</p>
                </div>
            )}

            {!loading && !error && !endpointUnavailable && certificates.length === 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                    <p className="text-gray-600">No SSH certificates found.</p>
                    <p className="text-gray-600 text-sm mt-1">SSH certificates will appear here once issued.</p>
                </div>
            )}

            {!loading && !error && !endpointUnavailable && certificates.length > 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    {certificates.map((cert) => {
                        const status = sshCertStatus(cert);
                        const expanded = expandedId === cert.id;

                        return (
                            <div key={cert.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedId(expanded ? null : cert.id)}
                                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                    <StatusBadge
                                        status={statusBadgeType(status)}
                                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                                    />
                                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                                        {cert.keyId || cert.id}
                                    </span>
                                    <span className="text-xs text-gray-600 flex-shrink-0">
                                        Valid until: {formatDate(cert.validBefore)}
                                    </span>
                                </button>

                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <DetailField label="Key ID" value={cert.keyId} />
                                            <DetailField label="Serial Number" value={cert.serialNumber} mono />
                                            <DetailField label="Principals" value={formatPrincipals(cert.principals)} />
                                            <DetailField label="Valid After" value={formatDate(cert.validAfter)} />
                                            <DetailField label="Valid Before" value={formatDate(cert.validBefore)} />
                                        </div>

                                        {status === 'revoked' && (
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded p-2">
                                                <span className="text-xs text-red-800 dark:text-red-400">This certificate has been revoked.</span>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-300 dark:border-gray-700">
                                            <button
                                                onClick={() => handleDownload(cert)}
                                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                            >
                                                Download Certificate
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MySshCertificates;
