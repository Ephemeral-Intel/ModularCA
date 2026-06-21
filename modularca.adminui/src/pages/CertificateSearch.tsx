import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPostWithMfa, apiBlob } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
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

interface PaginatedResult {
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
    items: any[];
}

const CertificateSearch: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [subjectFilter, setSubjectFilter] = useState('');
    const [serialFilter, setSerialFilter] = useState('');
    const [sanFilter, setSanFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked' | 'expired'>('all');
    const [issuerFilter, setIssuerFilter] = useState('');
    const [caIdFilter, setCaIdFilter] = useState('');
    const [keyAlgorithmFilter, setKeyAlgorithmFilter] = useState('');
    const [notAfterFrom, setNotAfterFrom] = useState('');
    const [notAfterTo, setNotAfterTo] = useState('');
    const [issuedFrom, setIssuedFrom] = useState('');
    const [issuedTo, setIssuedTo] = useState('');
    const [authorities, setAuthorities] = useState<any[]>([]);

    const [results, setResults] = useState<PaginatedResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(25);

    // Fetch CAs for the issuing CA dropdown
    useEffect(() => {
        apiGet<any>('/api/v1/admin/authorities')
            .then((data) => {
                const cas = Array.isArray(data) ? data : (data.items || data.authorities || []);
                const flat: any[] = [];
                const flatten = (list: any[]) => {
                    for (const ca of list) {
                        flat.push(ca);
                        if (ca.children) flatten(ca.children);
                    }
                };
                flatten(cas);
                setAuthorities(flat);
            })
            .catch(() => {
                // Non-critical — filter just won't show CAs
            });
    }, []);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const buildQueryString = useCallback((overridePage?: number) => {
        const params = new URLSearchParams();
        if (subjectFilter) params.append('subject', subjectFilter);
        if (serialFilter) params.append('serial', serialFilter);
        if (sanFilter) params.append('san', sanFilter);
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (issuerFilter) params.append('issuer', issuerFilter);
        if (caIdFilter) params.append('caId', caIdFilter);
        if (keyAlgorithmFilter) params.append('keyAlgorithm', keyAlgorithmFilter);
        if (notAfterFrom) params.append('notAfterFrom', notAfterFrom);
        if (notAfterTo) params.append('notAfterTo', notAfterTo);
        if (issuedFrom) params.append('issuedFrom', issuedFrom);
        if (issuedTo) params.append('issuedTo', issuedTo);
        params.append('page', String(overridePage ?? page));
        params.append('pageSize', String(pageSize));
        return params.toString();
    }, [subjectFilter, serialFilter, sanFilter, statusFilter, issuerFilter, caIdFilter, keyAlgorithmFilter, notAfterFrom, notAfterTo, issuedFrom, issuedTo, page, pageSize]);

    const fetchResults = useCallback((overridePage?: number) => {
        setLoading(true);
        setError(null);
        setSearched(true);

        const qs = buildQueryString(overridePage);
        apiGet<PaginatedResult>(`/api/v1/admin/certificates?${qs}`)
            .then((data) => {
                setResults(data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message || 'Failed to load certificates');
                setLoading(false);
            });
    }, [buildQueryString]);

    const handleSearch = () => {
        setPage(1);
        fetchResults(1);
    };

    // Debounced auto-search when text filters change
    useEffect(() => {
        if (!searched) return; // Don't auto-search before first manual search
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            fetchResults(1);
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [subjectFilter, serialFilter, sanFilter, statusFilter, issuerFilter, caIdFilter, keyAlgorithmFilter, notAfterFrom, notAfterTo, issuedFrom, issuedTo]);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        fetchResults(newPage);
    };

    const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
    const [revokeReason, setRevokeReason] = useState('Unspecified');
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
        let sans: string[] | undefined;
        const raw = cert.subjectAlternativeNames ?? cert.subjectAlternativeNamesJson;
        if (Array.isArray(raw)) {
            sans = raw;
        } else if (typeof raw === 'string' && raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) sans = parsed;
            } catch {
                // fall through
            }
        }
        setReissueTarget({
            id: cert.certificateId,
            serialNumber: cert.serialNumber,
            subjectDN: cert.subjectDN || cert.subject,
            sans,
            notBefore: cert.notBefore,
            notAfter: cert.notAfter,
        });
        setReissueOpen(true);
    };

    const handleReissueSuccess = (message: string) => {
        showToast('success', message);
        fetchResults();
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
            setRevokeReason('Unspecified');
            fetchResults();
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
        const cn = (cert.subjectDN || cert.subject || '').match(/CN=([^,]+)/)?.[1] || cert.serialNumber || 'cert';
        return cn.replace(/[^a-zA-Z0-9._-]/g, '_');
    };

    const handleDownloadPem = (cert: any) => {
        if (!cert.pem) { showToast('warning', 'PEM data not available'); return; }
        downloadBlob(cert.pem, `${getCertName(cert)}.pem`, 'application/x-pem-file');
    };

    // Blob downloads now go through apiBlob().
    const handleDownloadDer = async (cert: any) => {
        try {
            const serial = cert.serialNumber || cert.serial;
            const resp = await apiBlob(`/api/v1/admin/certificates/${serial}/file`, {
                headers: { Accept: 'application/pkix-cert' },
            });
            const blob = await resp.blob();
            downloadBlob(blob, `${getCertName(cert)}.crt`, 'application/pkix-cert');
        } catch (err: any) { showToast('error', err.message || 'Download failed'); }
    };

    const handleDownloadChainPem = async (cert: any) => {
        try {
            const serial = cert.serialNumber || cert.serial;
            const resp = await apiBlob(`/api/v1/user/certificates/${serial}/chain`);
            const chainPem = await resp.text();
            downloadBlob(chainPem, `${getCertName(cert)}-fullchain.pem`, 'application/x-pem-file');
        } catch (err: any) {
            if (cert.pem) {
                downloadBlob(cert.pem, `${getCertName(cert)}-chain.pem`, 'application/x-pem-file');
                return;
            }
            showToast('error', err.message || 'Download failed');
        }
    };

    const handleCopySerial = (serial: string) => {
        navigator.clipboard.writeText(serial).catch(() => {});
    };

    const inputClass = 'w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500';
    const labelClass = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1';

    const items = results?.items ?? [];
    const total = results?.total ?? 0;
    const totalPages = results?.totalPages ?? 0;

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Certificate Search</h1>

            {/* Search Form Card */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Search Filters</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>Subject</label>
                        <input
                            type="text"
                            value={subjectFilter}
                            onChange={(e) => setSubjectFilter(e.target.value)}
                            placeholder="e.g. CN=example.com"
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Serial Number</label>
                        <input
                            type="text"
                            value={serialFilter}
                            onChange={(e) => setSerialFilter(e.target.value)}
                            placeholder="e.g. 01AB3F..."
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Subject Alternative Name</label>
                        <input
                            type="text"
                            value={sanFilter}
                            onChange={(e) => setSanFilter(e.target.value)}
                            placeholder="e.g. *.example.com"
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Status</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className={inputClass}
                        >
                            <option value="all">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="revoked">Revoked</option>
                            <option value="expired">Expired</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Issuing CA</label>
                        <select
                            value={caIdFilter}
                            onChange={(e) => setCaIdFilter(e.target.value)}
                            className={inputClass}
                        >
                            <option value="">All CAs</option>
                            {authorities.map((ca) => (
                                <option key={ca.id} value={ca.id}>{ca.label || ca.name || ca.commonName || ca.subjectDN || ca.id}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Issuer DN</label>
                        <input
                            type="text"
                            value={issuerFilter}
                            onChange={(e) => setIssuerFilter(e.target.value)}
                            placeholder="e.g. CN=My CA"
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Key Algorithm</label>
                        <select
                            value={keyAlgorithmFilter}
                            onChange={(e) => setKeyAlgorithmFilter(e.target.value)}
                            className={inputClass}
                        >
                            <option value="">All Algorithms</option>
                            <option value="RSA">RSA</option>
                            <option value="ECDSA">ECDSA</option>
                            <option value="Ed25519">Ed25519</option>
                            <option value="Ed448">Ed448</option>
                            <option value="DSA">DSA</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Expires After</label>
                        <input
                            type="date"
                            value={notAfterFrom}
                            onChange={(e) => setNotAfterFrom(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Expires Before</label>
                        <input
                            type="date"
                            value={notAfterTo}
                            onChange={(e) => setNotAfterTo(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Issued After</label>
                        <input
                            type="date"
                            value={issuedFrom}
                            onChange={(e) => setIssuedFrom(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Issued Before</label>
                        <input
                            type="date"
                            value={issuedTo}
                            onChange={(e) => setIssuedTo(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div className="flex items-end gap-2 lg:col-span-2">
                        <button
                            onClick={handleSearch}
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-sm font-semibold bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? 'Searching...' : 'Search'}
                        </button>
                        {(subjectFilter || serialFilter || sanFilter || statusFilter !== 'all' || issuerFilter || caIdFilter || keyAlgorithmFilter || notAfterFrom || notAfterTo || issuedFrom || issuedTo) && (
                            <button
                                onClick={() => {
                                    setSubjectFilter('');
                                    setSerialFilter('');
                                    setSanFilter('');
                                    setStatusFilter('all');
                                    setIssuerFilter('');
                                    setCaIdFilter('');
                                    setKeyAlgorithmFilter('');
                                    setNotAfterFrom('');
                                    setNotAfterTo('');
                                    setIssuedFrom('');
                                    setIssuedTo('');
                                    setPage(1);
                                }}
                                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Results */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-4">
                    <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
            )}

            {searched && !loading && !error && results && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Results</h3>
                        <span className="text-xs text-gray-600">{total} certificate{total !== 1 ? 's' : ''} found</span>
                    </div>

                    <div>
                        {items.length === 0 && (
                            <div className="p-4 text-sm text-gray-600 text-center">No certificates match the search criteria</div>
                        )}
                        {items.map((cert) => {
                            const key = cert.serialNumber || cert.certificateId;
                            const expanded = expandedKey === key;
                            const status = certStatus(cert);

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
                                        <span className="ml-auto text-xs text-gray-600 flex-shrink-0">
                                            {cert.issuer ? `Issuer: ${cert.issuer.substring(0, 30)}` : ''} | Expires: {formatDate(cert.notAfter)}
                                        </span>
                                    </button>
                                    {expanded && (
                                        <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                            <DetailField label="Serial" value={cert.serialNumber} mono />
                                            <DetailField label="Subject" value={cert.subjectDN} />
                                            <DetailField label="Issuer" value={cert.issuer} />
                                            <DetailField label="Not Before" value={formatDate(cert.notBefore)} />
                                            <DetailField label="Not After" value={formatDate(cert.notAfter)} />
                                            <DetailField label="SANs" value={cert.subjectAlternativeNames?.join(', ')} />
                                            <DetailField label="Key Usage" value={cert.keyUsage} />
                                            <DetailField label="Extended Key Usage" value={cert.extendedKeyUsage?.join(', ') || cert.extendedKeyUsage} />
                                            <DetailField label="Key Algorithm" value={cert.keyAlgorithm} />
                                            <DetailField label="Signature Algorithm" value={cert.signatureAlgorithm} />
                                            <DetailField label="SHA-1 Thumbprint" value={cert.thumbprint || cert.sha1Thumbprint} mono />
                                            <DetailField label="SHA-256 Thumbprint" value={cert.sha256Thumbprint || cert.thumbprints} mono />

                                            <div className="flex gap-2 mt-3">
                                                {status === 'active' && (
                                                    <button
                                                        onClick={() => { setRevokeTarget(cert); setRevokeError(null); setRevokeReason('Unspecified'); }}
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
                                                <button
                                                    onClick={() => handleCopySerial(cert.serialNumber || '')}
                                                    className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-400 dark:border-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                                >
                                                    Copy Serial
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="px-4 py-3 border-t border-gray-300 dark:border-gray-700 flex items-center justify-between">
                            <button
                                onClick={() => handlePageChange(page - 1)}
                                disabled={page <= 1}
                                className="px-3 py-1.5 text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-400 dark:border-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => handlePageChange(page + 1)}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-400 dark:border-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}
            {/* Revoke confirmation modal */}
            {revokeTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Revoke Certificate</h3>
                        <div className="space-y-2">
                            <div><span className="text-xs text-gray-600">Serial:</span>
                                <div className="font-mono text-sm text-gray-800 dark:text-gray-200 break-all">{revokeTarget.serialNumber}</div>
                            </div>
                            <div><span className="text-xs text-gray-600">Subject:</span>
                                <div className="text-sm text-gray-800 dark:text-gray-200 break-all">{revokeTarget.subjectDN || revokeTarget.subject}</div>
                            </div>
                            <div>
                                <label htmlFor="revoke-reason-search" className="block text-xs text-gray-600 dark:text-gray-400">Reason</label>
                                <select id="revoke-reason-search" value={revokeReason} onChange={e => setRevokeReason(e.target.value)}
                                    disabled={revokeLoading}
                                    className="w-full mt-1 px-2 py-1.5 text-sm bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white">
                                    <option value="Unspecified">Unspecified</option>
                                    <option value="KeyCompromise">Key Compromise</option>
                                    <option value="CACompromise">CA Compromise</option>
                                    <option value="AffiliationChanged">Affiliation Changed</option>
                                    <option value="Superseded">Superseded</option>
                                    <option value="CessationOfOperation">Cessation of Operation</option>
                                </select>
                            </div>
                        </div>
                        {revokeError && (
                            <p className="text-sm text-red-500">{revokeError}</p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button onClick={() => { if (!revokeLoading) setRevokeTarget(null); }}
                                disabled={revokeLoading}
                                className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleRevokeConfirm}
                                disabled={revokeLoading}
                                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-2">
                                {revokeLoading && (
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
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

export default CertificateSearch;
