import React, { useState, useEffect } from 'react';
import { apiGet } from '../api/client';
import StatusBadge from '../components/cards/StatusBadge';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusType(status: string): 'active' | 'pending' | 'disabled' | 'enabled' {
    switch (status?.toLowerCase()) {
        case 'approved': return 'active';
        case 'pending': return 'pending';
        case 'rejected': return 'disabled';
        case 'issued': return 'enabled';
        default: return 'pending';
    }
}

interface CertRequest {
    id: string;
    subjectDN: string;
    status: string;
    submittedAt: string;
    certProfileId: string | null;
    signingProfileId: string | null;
    issuedCertificateSerial: string | null;
}

const CertificateRequests: React.FC = () => {
    const [requests, setRequests] = useState<CertRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        apiGet<CertRequest[]>('/api/v1/user/requests')
            .then((data) => setRequests(Array.isArray(data) ? data : []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Requests</h1>
                <a href="/request" className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                    New Request
                </a>
            </div>

            {loading && <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>}
            {error && <p className="text-sm text-red-800 dark:text-red-400">{error}</p>}

            {!loading && !error && requests.length === 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                    <p className="text-gray-600">No certificate requests found.</p>
                    <a href="/request" className="text-blue-800 dark:text-blue-400 text-sm hover:underline mt-2 inline-block">Submit your first request</a>
                </div>
            )}

            {!loading && !error && requests.length > 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    {requests.map((req) => {
                        const expanded = expandedId === req.id;
                        return (
                            <div key={req.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedId(expanded ? null : req.id)}
                                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                    <StatusBadge status={statusType(req.status)} label={req.status} />
                                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                                        {req.subjectDN || '(no subject)'}
                                    </span>
                                    <span className="text-xs text-gray-600 flex-shrink-0">{formatDate(req.submittedAt)}</span>
                                </button>
                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-2">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <span className="text-xs text-gray-600">Request ID</span>
                                                <p className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">{req.id}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-600">Subject</span>
                                                <p className="text-xs text-gray-800 dark:text-gray-200 break-all">{req.subjectDN || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-600">Status</span>
                                                <p className="text-xs text-gray-800 dark:text-gray-200">{req.status}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-600">Submitted</span>
                                                <p className="text-xs text-gray-800 dark:text-gray-200">{formatDate(req.submittedAt)}</p>
                                            </div>
                                        </div>
                                        {req.issuedCertificateSerial && (
                                            <div className="pt-2 border-t border-gray-300 dark:border-gray-700">
                                                <span className="text-xs text-gray-600">Issued Certificate</span>
                                                <p className="font-mono text-xs text-green-800 dark:text-green-400 break-all">{req.issuedCertificateSerial}</p>
                                                <a href="/certificates" className="text-xs text-blue-800 dark:text-blue-400 hover:underline mt-1 inline-block">
                                                    View in My Certificates
                                                </a>
                                            </div>
                                        )}
                                        {req.status?.toLowerCase() === 'rejected' && (
                                            <div className="pt-2 border-t border-gray-300 dark:border-gray-700">
                                                <span className="text-xs text-red-800 dark:text-red-400">This request was rejected by an administrator.</span>
                                            </div>
                                        )}
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

export default CertificateRequests;
