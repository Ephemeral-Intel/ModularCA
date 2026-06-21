import React, { useState, useEffect } from 'react';
import { apiGet, API_BASE } from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function caStatus(cert: any): 'active' | 'revoked' | 'expired' {
    if (cert.revoked) return 'revoked';
    if (new Date(cert.notAfter) < new Date()) return 'expired';
    return 'active';
}

function statusBadgeType(s: string): 'active' | 'disabled' | 'pending' {
    if (s === 'active') return 'active';
    if (s === 'revoked') return 'disabled';
    return 'pending';
}

function caType(cert: any): string {
    // A self-signed cert (issuer == subject) is a root CA; otherwise intermediate
    if (cert.issuer && cert.subjectDN && cert.issuer === cert.subjectDN) return 'Root';
    return 'Intermediate';
}

function parseCn(dn: string): string {
    const match = dn?.match(/CN=([^,]+)/);
    return match ? match[1] : dn || '-';
}

interface CaCertificate {
    certificateId: string;
    serialNumber: string;
    subjectDN: string;
    issuer: string;
    notBefore: string;
    notAfter: string;
    keyAlgorithm: string;
    keySize: string;
    signatureAlgorithm: string;
    isCA: boolean;
    revoked: boolean;
}

const CaInformation: React.FC = () => {
    const { showToast } = useToast();
    const [authorities, setAuthorities] = useState<CaCertificate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSerial, setExpandedSerial] = useState<string | null>(null);

    useEffect(() => {
        apiGet<CaCertificate[]>('/api/v1/user/authorities')
            .then((data) => setAuthorities(Array.isArray(data) ? data : []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const downloadBlob = (data: BlobPart, filename: string, mimeType: string) => {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadPem = async (cert: CaCertificate) => {
        try {
            const resp = await fetch(`${API_BASE}/api/v1/public/ca/${cert.serialNumber}`, {
                headers: { Accept: 'application/x-pem-file' }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const pem = await resp.text();
            const name = parseCn(cert.subjectDN).replace(/[^a-zA-Z0-9._-]/g, '_');
            downloadBlob(pem, `${name}.pem`, 'application/x-pem-file');
        } catch (err: any) {
            showToast('error', err.message || 'Download failed');
        }
    };

    const handleDownloadDer = async (cert: CaCertificate) => {
        try {
            const resp = await fetch(`${API_BASE}/api/v1/public/ca/${cert.serialNumber}`, {
                headers: { Accept: 'application/pkix-cert' }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const name = parseCn(cert.subjectDN).replace(/[^a-zA-Z0-9._-]/g, '_');
            downloadBlob(blob, `${name}.cer`, 'application/pkix-cert');
        } catch (err: any) {
            showToast('error', err.message || 'Download failed');
        }
    };

    const handleDownloadChain = async (cert: CaCertificate) => {
        try {
            const resp = await fetch(`${API_BASE}/api/v1/user/authorities/${cert.serialNumber}/chain`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const chainPem = await resp.text();
            const name = parseCn(cert.subjectDN).replace(/[^a-zA-Z0-9._-]/g, '_');
            downloadBlob(chainPem, `${name}-chain.pem`, 'application/x-pem-file');
        } catch (err: any) {
            showToast('error', err.message || 'Download failed');
        }
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trusted CAs</h1>

            {loading && <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>}
            {error && <p className="text-sm text-red-800 dark:text-red-400">{error}</p>}

            {!loading && !error && authorities.length === 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                    <p className="text-gray-600">No Certificate Authorities available.</p>
                </div>
            )}

            {!loading && !error && authorities.length > 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    {authorities.map((cert) => {
                        const status = caStatus(cert);
                        const type = caType(cert);
                        const expanded = expandedSerial === cert.serialNumber;
                        const daysLeft = Math.ceil((new Date(cert.notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                        return (
                            <div key={cert.serialNumber} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedSerial(expanded ? null : cert.serialNumber)}
                                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                    <StatusBadge
                                        status={statusBadgeType(status)}
                                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                                    />
                                    <span className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                                        {type}
                                    </span>
                                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                                        {parseCn(cert.subjectDN)}
                                    </span>
                                    {status === 'active' && daysLeft <= 90 && (
                                        <span className="text-xs text-yellow-800 dark:text-yellow-400 flex-shrink-0">{daysLeft}d left</span>
                                    )}
                                    <span className="text-xs text-gray-600 flex-shrink-0">
                                        Expires: {formatDate(cert.notAfter)}
                                    </span>
                                </button>

                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <DetailField label="Subject" value={cert.subjectDN} />
                                            <DetailField label="Issuer" value={cert.issuer} />
                                            <DetailField label="Serial Number" value={cert.serialNumber} mono />
                                            <DetailField label="Not Before" value={formatDate(cert.notBefore)} />
                                            <DetailField label="Not After" value={formatDate(cert.notAfter)} />
                                            <DetailField label="Algorithm" value={`${cert.keyAlgorithm || '-'} ${cert.keySize || ''}`} />
                                            <DetailField label="Signature" value={cert.signatureAlgorithm || '-'} />
                                            <DetailField label="Type" value={type} />
                                        </div>

                                        {status === 'revoked' && (
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded p-2">
                                                <span className="text-xs text-red-800 dark:text-red-400">This CA certificate has been revoked.</span>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-300 dark:border-gray-700">
                                            <button
                                                onClick={() => handleDownloadPem(cert)}
                                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                            >
                                                PEM
                                            </button>
                                            <button
                                                onClick={() => handleDownloadDer(cert)}
                                                className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                DER
                                            </button>
                                            <button
                                                onClick={() => handleDownloadChain(cert)}
                                                className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                Trust Chain
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

export default CaInformation;
