import React, { useState, useEffect } from 'react';
import { apiGet, apiBlob } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function certStatus(cert: any): 'active' | 'revoked' | 'expired' {
    if (cert.revoked) return 'revoked';
    if (new Date(cert.notAfter) < new Date()) return 'expired';
    return 'active';
}

function statusBadgeType(s: string): 'active' | 'disabled' | 'pending' {
    if (s === 'active') return 'active';
    if (s === 'revoked') return 'disabled';
    return 'pending';
}

function daysUntilExpiry(notAfter: string): number {
    return Math.ceil((new Date(notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const MyCertificates: React.FC = () => {
    const { showToast } = useToast();
    const { requireStepUp } = useStepUp();
    const [certificates, setCertificates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSerial, setExpandedSerial] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked' | 'expired'>('all');

    // PFX export modal state
    const [pfxTarget, setPfxTarget] = useState<any | null>(null);
    const [pfxPassword, setPfxPassword] = useState('');
    const [pfxLoading, setPfxLoading] = useState(false);

    useEffect(() => {
        apiGet<any>('/api/v1/user/certificates')
            .then((data) => setCertificates(Array.isArray(data) ? data : (data.items || [])))
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

    const getCertName = (cert: any) => {
        const cn = (cert.subjectDN || '').match(/CN=([^,]+)/)?.[1] || cert.serialNumber || 'cert';
        return cn.replace(/[^a-zA-Z0-9._-]/g, '_');
    };

    const handleDownloadPem = async (cert: any) => {
        try {
            const resp = await apiBlob(`/api/v1/user/certificates/${cert.serialNumber}/file`, {
                headers: { Accept: 'application/x-pem-file' },
            });
            const pem = await resp.text();
            downloadBlob(pem, `${getCertName(cert)}.pem`, 'application/x-pem-file');
        } catch (err: any) { showToast('error', err.message || 'Download failed'); }
    };

    const handleDownloadDer = async (cert: any) => {
        try {
            const resp = await apiBlob(`/api/v1/user/certificates/${cert.serialNumber}/file`, {
                headers: { Accept: 'application/pkix-cert' },
            });
            const blob = await resp.blob();
            downloadBlob(blob, `${getCertName(cert)}.cer`, 'application/pkix-cert');
        } catch (err: any) { showToast('error', err.message || 'Download failed'); }
    };

    const handleDownloadChain = async (cert: any) => {
        try {
            const resp = await apiBlob(`/api/v1/user/certificates/${cert.serialNumber}/chain`);
            const chainPem = await resp.text();
            downloadBlob(chainPem, `${getCertName(cert)}-fullchain.pem`, 'application/x-pem-file');
        } catch (err: any) { showToast('error', err.message || 'Download failed'); }
    };

    const handleExportPfx = (cert: any) => {
        setPfxTarget(cert);
        setPfxPassword('');
    };

    const handlePfxConfirm = async () => {
        if (!pfxTarget) return;
        setPfxLoading(true);
        try {
            const doExport = async (extraHeaders: Record<string, string> = {}) => {
                return apiBlob(`/api/v1/user/certificates/${pfxTarget.serialNumber}/export`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...extraHeaders },
                    body: JSON.stringify({ password: pfxPassword }),
                });
            };

            let resp: Response;
            try {
                resp = await doExport();
            } catch (err: any) {
                // Handle step-up MFA requirement
                if (err.requiresStepUp) {
                    const mfaToken = await requireStepUp('export-cert', pfxTarget.serialNumber);
                    resp = await doExport({ 'X-MFA-Token': mfaToken });
                } else {
                    throw err;
                }
            }

            const blob = await resp!.blob();
            downloadBlob(blob, `${getCertName(pfxTarget)}.pfx`, 'application/x-pkcs12');
            setPfxTarget(null);
        } catch (err: any) { showToast('error', err.message || 'PFX export failed'); }
        finally { setPfxLoading(false); }
    };

    const filtered = certificates.filter(cert => {
        if (statusFilter === 'all') return true;
        return certStatus(cert) === statusFilter;
    });

    const inputClass = 'px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500';

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Certificates</h1>
                <a href="/request" className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                    Request New
                </a>
            </div>

            {/* Filter */}
            <div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={inputClass}>
                    <option value="all">All Certificates</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="revoked">Revoked</option>
                </select>
            </div>

            {loading && <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>}
            {error && <p className="text-sm text-red-800 dark:text-red-400">{error}</p>}

            {!loading && !error && filtered.length === 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                    <p className="text-gray-600">No certificates found.</p>
                    <a href="/request" className="text-blue-800 dark:text-blue-400 text-sm hover:underline mt-2 inline-block">Request your first certificate</a>
                </div>
            )}

            {!loading && !error && filtered.length > 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    {filtered.map((cert) => {
                        const serial = cert.serialNumber;
                        const status = certStatus(cert);
                        const expanded = expandedSerial === serial;
                        const days = daysUntilExpiry(cert.notAfter);
                        const hasPrivateKey = cert.encryptedPrivateKey && cert.encryptedPrivateKey.length > 0;

                        return (
                            <div key={serial} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedSerial(expanded ? null : serial)}
                                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                    <StatusBadge status={statusBadgeType(status)} label={status.charAt(0).toUpperCase() + status.slice(1)} />
                                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{cert.subjectDN || serial}</span>
                                    {status === 'active' && days <= 30 && (
                                        <span className="text-xs text-yellow-800 dark:text-yellow-400 flex-shrink-0">{days}d left</span>
                                    )}
                                    <span className="text-xs text-gray-600 flex-shrink-0">Expires: {formatDate(cert.notAfter)}</span>
                                </button>
                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <DetailField label="Serial Number" value={serial} mono />
                                            <DetailField label="Subject" value={cert.subjectDN} />
                                            <DetailField label="Issuer" value={cert.issuer} />
                                            <DetailField label="Not Before" value={formatDate(cert.notBefore)} />
                                            <DetailField label="Not After" value={formatDate(cert.notAfter)} />
                                            <DetailField label="Algorithm" value={`${cert.keyAlgorithm || '-'} ${cert.keySize || ''}`} />
                                            <DetailField label="Signature" value={cert.signatureAlgorithm || '-'} />
                                        </div>

                                        {cert.subjectAlternativeNames?.length > 0 && (
                                            <div>
                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">SANs</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {cert.subjectAlternativeNames.map((san: string, i: number) => (
                                                        <span key={i} className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">{san}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {status === 'revoked' && (
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded p-2">
                                                <span className="text-xs text-red-800 dark:text-red-400">Revoked{cert.revocationReason ? `: ${cert.revocationReason}` : ''}</span>
                                            </div>
                                        )}

                                        {/* Download buttons */}
                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-300 dark:border-gray-700">
                                            <button onClick={() => handleDownloadPem(cert)}
                                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                                                PEM
                                            </button>
                                            <button onClick={() => handleDownloadDer(cert)}
                                                className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                                DER
                                            </button>
                                            <button onClick={() => handleDownloadChain(cert)}
                                                className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                                Full Chain
                                            </button>
                                            {hasPrivateKey && (
                                                <button onClick={() => handleExportPfx(cert)}
                                                    className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors">
                                                    Export PFX
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* PFX Export Modal */}
            {pfxTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !pfxLoading && setPfxTarget(null)}>
                    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Export PFX</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Enter a password to protect the PFX file:</p>
                        <input type="password" value={pfxPassword} onChange={e => setPfxPassword(e.target.value)}
                            autoComplete="new-password" placeholder="PFX password" autoFocus
                            className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setPfxTarget(null)} disabled={pfxLoading}
                                className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={handlePfxConfirm} disabled={!pfxPassword || pfxLoading}
                                className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40 transition-colors">
                                {pfxLoading ? 'Exporting...' : 'Export'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyCertificates;
