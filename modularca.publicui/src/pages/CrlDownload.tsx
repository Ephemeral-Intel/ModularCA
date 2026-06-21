import React, { useState, useEffect } from 'react';
import { apiGet } from '../api/client';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function extractCn(subjectDn: string | null | undefined): string | null {
    if (!subjectDn) return null;
    for (const part of subjectDn.split(',')) {
        const trimmed = part.trim();
        if (trimmed.toUpperCase().startsWith('CN=')) return trimmed.substring(3).trim();
    }
    return null;
}

const CrlDownload: React.FC = () => {
    const [cas, setCas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiGet<any>('/api/v1/public/ca')
            .then((data) => setCas(Array.isArray(data) ? data : (data.items || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CRL Downloads</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Download Certificate Revocation Lists (CRLs) to verify whether certificates have been revoked.
                </p>
            </div>

            {loading && <p className="text-sm text-gray-600 dark:text-gray-400">Loading...</p>}
            {error && <p className="text-sm text-red-800 dark:text-red-400">{error}</p>}

            <div className="space-y-3">
                {cas.map((ca) => {
                    const id = ca.serialNumber || ca.serial || ca.id;
                    const friendlyName = ca.label || ca.name || extractCn(ca.subjectDN) || id;
                    return (
                        <div key={id} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{ca.subjectDN || ca.name}</h3>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Serial: <span className="font-mono">{id}</span>
                                    </p>
                                    {ca.lastCrlGenerated && (
                                        <p className="text-xs text-gray-600 mt-0.5">
                                            Last generated: {formatDate(ca.lastCrlGenerated)}
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <a
                                        href={`/crl/${id}`}
                                        className="px-3 py-1.5 text-xs bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                                        download={`${friendlyName}.crl`}
                                    >
                                        Full CRL
                                    </a>
                                    <a
                                        href={`/crl/${id}/delta`}
                                        className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                        download={`${friendlyName}-delta.crl`}
                                    >
                                        Delta CRL
                                    </a>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!loading && !error && cas.length === 0 && (
                <p className="text-sm text-gray-600 text-center py-8">No CAs available.</p>
            )}

            {/* CRL Distribution Points info */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">CRL Distribution Points</h2>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                    Certificates issued by this CA include CRL Distribution Point (CDP) extensions
                    that point to these CRL URLs. Most applications will check CRLs automatically.
                </p>
            </div>
        </div>
    );
};

export default CrlDownload;
