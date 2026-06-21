import React, { useState, useEffect } from 'react';
import { apiGet, apiPostWithMfa, apiBlob } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import DataCard from '../components/cards/DataCard';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import CertificateReissueModal from '../components/CertificateReissueModal';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function certStatus(cert: any): 'active' | 'revoked' | 'expired' {
    if (cert.revoked) return 'revoked';
    if (new Date(cert.notAfter) < new Date()) return 'expired';
    return 'active';
}

// value = canonical RevocationReason enum name (the API binder is strict —
// EnumDataType validation rejects anything else). label = the human-friendly form
// shown in the dropdown. "Remove from CRL" is intentionally absent because the
// C# enum doesn't define it (RFC 5280 reason 8 is unmapped).
const REVOCATION_REASONS: { value: string; label: string }[] = [
    { value: 'Unspecified', label: 'Unspecified' },
    { value: 'KeyCompromise', label: 'Key Compromise' },
    { value: 'CACompromise', label: 'CA Compromise' },
    { value: 'AffiliationChanged', label: 'Affiliation Changed' },
    { value: 'Superseded', label: 'Superseded' },
    { value: 'CessationOfOperation', label: 'Cessation of Operation' },
    { value: 'CertificateHold', label: 'Certificate Hold' },
    { value: 'PrivilegeWithdrawn', label: 'Privilege Withdrawn' },
];

// Parse thumbprints from JSON string like '{"SHA 1":"...","SHA 256":"..."}'
function parseThumbprints(raw: any): { label: string; value: string }[] | null {
    if (!raw) return null;
    try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (typeof obj === 'object' && obj !== null) {
            return Object.entries(obj).map(([k, v]) => ({ label: k, value: String(v) }));
        }
    } catch {
        // not valid JSON, return as-is
    }
    return null;
}

// Parse SANs from JSON array string or actual array
function parseSans(raw: any): string[] | null {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // not valid JSON
    }
    return null;
}

const Certificates: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked' | 'expired'>('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [certificates, setCertificates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const pageSize = 20;

    // Extensions state (loaded on demand per certificate)
    const [extensionsData, setExtensionsData] = useState<Record<string, any>>({});
    const [extensionsLoading, setExtensionsLoading] = useState<Record<string, boolean>>({});
    const [extensionsError, setExtensionsError] = useState<Record<string, string | null>>({});
    const [extensionsVisible, setExtensionsVisible] = useState<Record<string, boolean>>({});

    // Revocation modal state
    const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
    const [revokeReason, setRevokeReason] = useState('Unspecified');
    const [revokeNotes, setRevokeNotes] = useState('');
    const [revokeLoading, setRevokeLoading] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);

    // Reissue modal state
    const [reissueOpen, setReissueOpen] = useState(false);
    const [reissueTarget, setReissueTarget] = useState<{
        id: string;
        serialNumber: string;
        subjectDN: string;
        sans?: string[];
        notBefore?: string;
        notAfter?: string;
    } | null>(null);

    const openReissueModal = (cert: any) => {
        const sans = parseSans(cert.subjectAlternativeNames) ?? parseSans(cert.subjectAlternativeNamesJson) ?? undefined;
        setReissueTarget({
            id: cert.certificateId,
            serialNumber: cert.serialNumber,
            subjectDN: cert.subjectDN,
            sans: sans ?? undefined,
            notBefore: cert.notBefore,
            notAfter: cert.notAfter,
        });
        setReissueOpen(true);
    };

    const handleReissueSuccess = (message: string) => {
        showToast('success', message);
        setRefreshTrigger((t) => t + 1);
    };


    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (search) params.set('search', search);
        if (statusFilter !== 'all') params.set('status', statusFilter);

        apiGet<any>(`/api/v1/admin/certificates?${params}`)
            .then((data) => {
                if (cancelled) return;
                const items = Array.isArray(data) ? data : (data.items || []);
                const total = data.totalPages || Math.ceil((data.totalCount || items.length) / pageSize) || 1;
                setCertificates(items);
                setTotalPages(total);
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load certificates');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [page, search, statusFilter, refreshTrigger]);

    const openRevokeModal = (cert: any) => {
        setRevokeTarget(cert);
        setRevokeReason('Unspecified');
        setRevokeNotes('');
        setRevokeError(null);
        setRevokeLoading(false);
    };

    const closeRevokeModal = () => {
        if (revokeLoading) return;
        setRevokeTarget(null);
    };

    const handleRevokeConfirm = async () => {
        if (!revokeTarget) return;
        setRevokeLoading(true);
        setRevokeError(null);
        try {
            await apiPostWithMfa(
                `/api/v1/admin/certificates/${revokeTarget.certificateId}/revoke`,
                { reason: revokeReason },
                requireStepUp,
                'revoke-cert',
                revokeTarget.certificateId,
            );
            setRevokeTarget(null);
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled')
                setRevokeError(err.message || 'Revocation failed');
        } finally {
            setRevokeLoading(false);
        }
    };

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

    // Blob downloads now go through apiBlob() which centralizes
    // the auth token lookup, CSRF header, refresh handling, and credentials mode.
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
            downloadBlob(blob, `${getCertName(cert)}.crt`, 'application/pkix-cert');
        } catch (err: any) { showToast('error', err.message || 'Download failed'); }
    };

    const handleDownloadChainPem = async (cert: any) => {
        try {
            const resp = await apiBlob(`/api/v1/user/certificates/${cert.serialNumber}/chain`);
            const chainPem = await resp.text();
            downloadBlob(chainPem, `${getCertName(cert)}-fullchain.pem`, 'application/x-pem-file');
        } catch (err: any) {
            // Fallback: just download the single cert PEM if we have it cached
            if (cert.pem) {
                downloadBlob(cert.pem, `${getCertName(cert)}-chain.pem`, 'application/x-pem-file');
                return;
            }
            showToast('error', err.message || 'Download failed');
        }
    };

    const toggleExtensions = async (cert: any) => {
        const key = cert.serialNumber || cert.certificateId;
        if (extensionsVisible[key]) {
            setExtensionsVisible((prev) => ({ ...prev, [key]: false }));
            return;
        }
        // Show the section
        setExtensionsVisible((prev) => ({ ...prev, [key]: true }));
        // If already loaded, no need to fetch again
        if (extensionsData[key]) return;
        // Fetch extensions
        setExtensionsLoading((prev) => ({ ...prev, [key]: true }));
        setExtensionsError((prev) => ({ ...prev, [key]: null }));
        try {
            const data = await apiGet<any>(`/api/v1/admin/certificates/${cert.serialNumber}/extensions`);
            setExtensionsData((prev) => ({ ...prev, [key]: data }));
        } catch (err: any) {
            setExtensionsError((prev) => ({ ...prev, [key]: err.message || 'Failed to load extensions' }));
        } finally {
            setExtensionsLoading((prev) => ({ ...prev, [key]: false }));
        }
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Certificates</h1>

            {/* Search and Filter Bar */}
            <div className="flex flex-wrap gap-4 items-center">
                <input
                    type="text"
                    placeholder="Search by subject or serial..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="flex-1 min-w-[250px] px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="revoked">Revoked</option>
                    <option value="expired">Expired</option>
                </select>
            </div>

            {/* Certificate List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Certificates</h3>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && certificates.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No certificates found</div>
                    )}
                    {!loading && !error && certificates.map((cert) => {
                        const key = cert.serialNumber || cert.certificateId;
                        const expanded = expandedKey === key;
                        const status = certStatus(cert);
                        const thumbprints = parseThumbprints(cert.thumbprints);
                        const sans = parseSans(cert.subjectAlternativeNames);
                        return (
                            <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedKey(expanded ? null : key)}
                                    className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                                    <StatusBadge status={status} />
                                    <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{cert.serialNumber?.substring(0, 16)}...</span>
                                    <span className="text-sm text-gray-900 dark:text-white truncate">{cert.subjectDN}</span>
                                    <span className="ml-auto text-xs text-gray-600">{formatDate(cert.notAfter)}</span>
                                </button>
                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                        {/* Revocation status banner */}
                                        {status === 'revoked' && (
                                            <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700/50 rounded-md flex items-center gap-2">
                                                <span className="inline-block px-2 py-0.5 text-xs font-semibold bg-red-600 text-gray-900 dark:text-white rounded">REVOKED</span>
                                                {cert.revocationReason && (
                                                    <span className="text-sm text-red-800 dark:text-red-300">Reason: {cert.revocationReason}</span>
                                                )}
                                                {cert.revokedAt && (
                                                    <span className="text-xs text-red-800 dark:text-red-400 ml-auto">{formatDate(cert.revokedAt)}</span>
                                                )}
                                            </div>
                                        )}

                                        <DetailField label="Serial" value={cert.serialNumber} mono />
                                        <DetailField label="Subject" value={cert.subjectDN} />
                                        <DetailField label="Issuer" value={cert.issuer} />
                                        <DetailField label="Not Before" value={formatDate(cert.notBefore)} />
                                        <DetailField label="Not After" value={formatDate(cert.notAfter)} />
                                        <DetailField label="Key Algorithm" value={cert.keyAlgorithm} />
                                        <DetailField label="Signature Algorithm" value={cert.signatureAlgorithm} />

                                        {/* Parsed thumbprints */}
                                        {thumbprints ? (
                                            thumbprints.map((tp) => (
                                                <DetailField key={tp.label} label={`Thumbprint (${tp.label})`} value={tp.value} mono />
                                            ))
                                        ) : (
                                            <DetailField label="Thumbprints" value={cert.thumbprints} mono />
                                        )}

                                        {/* Parsed SANs */}
                                        {sans && sans.length > 0 ? (
                                            <DetailField label="SANs" value={sans.join(', ')} />
                                        ) : (
                                            <DetailField label="SANs" value={cert.subjectAlternativeNames?.join?.(', ') || '-'} />
                                        )}

                                        {/* Extensions (loaded on demand) */}
                                        <div className="mt-3">
                                            <button
                                                onClick={() => toggleExtensions(cert)}
                                                className="px-3 py-1 text-xs bg-gray-200/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border border-gray-400 dark:border-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                {extensionsVisible[key] ? 'Hide Extensions' : 'View Extensions'}
                                            </button>
                                        </div>
                                        {extensionsVisible[key] && (
                                            <div className="mt-2 pl-2 border-l-2 border-gray-300 dark:border-gray-600 space-y-1">
                                                {extensionsLoading[key] && (
                                                    <div className="text-xs text-gray-600">Loading extensions...</div>
                                                )}
                                                {extensionsError[key] && (
                                                    <div className="text-xs text-red-800 dark:text-red-400">{extensionsError[key]}</div>
                                                )}
                                                {extensionsData[key] && (() => {
                                                    const ext = extensionsData[key];
                                                    return (
                                                        <>
                                                            {/* Basic Constraints */}
                                                            {ext.basicConstraints && (
                                                                <DetailField
                                                                    label="Basic Constraints"
                                                                    value={`CA: ${ext.basicConstraints.isCA ? 'Yes' : 'No'}${ext.basicConstraints.pathLength != null ? `, Path Length: ${ext.basicConstraints.pathLength}` : ''}`}
                                                                />
                                                            )}

                                                            {/* Key Usage */}
                                                            {ext.keyUsage && ext.keyUsage.length > 0 && (
                                                                <DetailField label="Key Usage" value={ext.keyUsage.join(', ')} />
                                                            )}

                                                            {/* Extended Key Usage */}
                                                            {ext.extendedKeyUsage && ext.extendedKeyUsage.length > 0 && (
                                                                <DetailField label="Extended Key Usage" value={ext.extendedKeyUsage.join(', ')} />
                                                            )}

                                                            {/* Subject Alternative Names */}
                                                            {ext.subjectAlternativeNames && ext.subjectAlternativeNames.length > 0 && (
                                                                <DetailField label="SANs (ext)" value={ext.subjectAlternativeNames.join(', ')} />
                                                            )}

                                                            {/* Subject Key Identifier */}
                                                            {ext.subjectKeyIdentifier && (
                                                                <DetailField label="Subject Key ID" value={ext.subjectKeyIdentifier} mono />
                                                            )}

                                                            {/* Authority Key Identifier */}
                                                            {ext.authorityKeyIdentifier && (
                                                                <DetailField label="Authority Key ID" value={ext.authorityKeyIdentifier} mono />
                                                            )}

                                                            {/* Authority Information Access */}
                                                            {ext.authorityInformationAccess && (
                                                                <>
                                                                    {ext.authorityInformationAccess.ocspUrls?.map((url: string, i: number) => (
                                                                        <DetailField
                                                                            key={`ocsp-${i}`}
                                                                            label="OCSP"
                                                                            value={
                                                                                <a href={url} target="_blank" rel="noopener noreferrer"
                                                                                    className="text-blue-500 hover:text-blue-400 underline break-all"
                                                                                    title="Open OCSP URL">{url}</a>
                                                                            }
                                                                        />
                                                                    ))}
                                                                    {ext.authorityInformationAccess.caIssuerUrls?.map((url: string, i: number) => (
                                                                        <DetailField
                                                                            key={`caissuer-${i}`}
                                                                            label="CA Issuer"
                                                                            value={
                                                                                <a href={url} target="_blank" rel="noopener noreferrer"
                                                                                    className="text-blue-500 hover:text-blue-400 underline break-all"
                                                                                    title="Open CA Issuer URL">{url}</a>
                                                                            }
                                                                        />
                                                                    ))}
                                                                </>
                                                            )}

                                                            {/* CRL Distribution Points */}
                                                            {ext.crlDistributionPoints && ext.crlDistributionPoints.length > 0 && (
                                                                ext.crlDistributionPoints.map((url: string, i: number) => (
                                                                    <DetailField
                                                                        key={`cdp-${i}`}
                                                                        label="CRL Distribution Point"
                                                                        value={
                                                                            <a href={url} target="_blank" rel="noopener noreferrer"
                                                                                className="text-blue-500 hover:text-blue-400 underline break-all"
                                                                                title="Open CRL URL">{url}</a>
                                                                        }
                                                                    />
                                                                ))
                                                            )}

                                                            {/* Certificate Policies */}
                                                            {ext.certificatePolicies && ext.certificatePolicies.length > 0 && (
                                                                <DetailField label="Certificate Policies" value={ext.certificatePolicies.join(', ')} mono />
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        <div className="flex gap-2 mt-3">
                                            {status === 'active' && (
                                                <button
                                                    onClick={() => openRevokeModal(cert)}
                                                    className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors"
                                                >
                                                    Revoke
                                                </button>
                                            )}
                                            {status === 'active' && (
                                                <button
                                                    onClick={() => openReissueModal(cert)}
                                                    className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700 rounded hover:bg-green-900 transition-colors"
                                                >
                                                    Reissue
                                                </button>
                                            )}
                                            <button onClick={() => handleDownloadPem(cert)}
                                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                                PEM
                                            </button>
                                            <button onClick={() => handleDownloadDer(cert)}
                                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                                DER
                                            </button>
                                            <button onClick={() => handleDownloadChainPem(cert)}
                                                className="px-3 py-1 text-xs bg-cyan-900/50 text-cyan-300 border border-cyan-700 rounded hover:bg-cyan-900 transition-colors">
                                                Full Chain
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Page {page} of {totalPages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Revocation Modal */}
            {revokeTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/50"
                    onClick={closeRevokeModal}
                >
                    <div
                        className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-gray-300 dark:border-gray-700">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Revoke Certificate</h2>
                        </div>

                        <div className="px-6 py-4 space-y-4">
                            {/* Certificate identification */}
                            <div className="space-y-1">
                                <div className="text-xs text-gray-600 dark:text-gray-400">Serial Number</div>
                                <div className="font-mono text-sm text-gray-800 dark:text-gray-200 break-all">{revokeTarget.serialNumber}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs text-gray-600 dark:text-gray-400">Subject</div>
                                <div className="text-sm text-gray-800 dark:text-gray-200 break-all">{revokeTarget.subjectDN}</div>
                            </div>

                            {/* Reason selection */}
                            <div className="space-y-1">
                                <label htmlFor="revoke-reason" className="block text-xs text-gray-600 dark:text-gray-400">
                                    Revocation Reason
                                </label>
                                <select
                                    id="revoke-reason"
                                    value={revokeReason}
                                    onChange={(e) => setRevokeReason(e.target.value)}
                                    disabled={revokeLoading}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-400 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                                >
                                    {REVOCATION_REASONS.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Optional notes */}
                            <div className="space-y-1">
                                <label htmlFor="revoke-notes" className="block text-xs text-gray-600 dark:text-gray-400">
                                    Notes (optional)
                                </label>
                                <textarea
                                    id="revoke-notes"
                                    value={revokeNotes}
                                    onChange={(e) => setRevokeNotes(e.target.value)}
                                    disabled={revokeLoading}
                                    rows={3}
                                    placeholder="Add any notes about this revocation..."
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-400 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-50"
                                />
                            </div>

                            {/* Error message */}
                            {revokeError && (
                                <div className="px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700/50 rounded text-sm text-red-800 dark:text-red-300">
                                    {revokeError}
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-300 dark:border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={closeRevokeModal}
                                disabled={revokeLoading}
                                className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRevokeConfirm}
                                disabled={revokeLoading}
                                className="px-4 py-2 text-sm bg-red-600 text-gray-900 dark:text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {revokeLoading && (
                                    <svg className="animate-spin h-4 w-4 text-gray-900 dark:text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                {revokeLoading ? 'Revoking...' : 'Revoke'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reissue Modal */}
            <CertificateReissueModal
                open={reissueOpen}
                onClose={() => setReissueOpen(false)}
                onSuccess={handleReissueSuccess}
                cert={reissueTarget}
            />

        </div>
    );
};

export default Certificates;
