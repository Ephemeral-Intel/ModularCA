import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysUntil(d: string): number {
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function monthKey(d: string): string {
    const date = new Date(d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

const FILTER_OPTIONS = [
    { label: '30 days', value: 30 },
    { label: '60 days', value: 60 },
    { label: '90 days', value: 90 },
    { label: '180 days', value: 180 },
    { label: '365 days', value: 365 },
];

const ExpiryCalendar: React.FC = () => {
    const [allCerts, setAllCerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterDays, setFilterDays] = useState(90);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    useEffect(() => {
        apiGet<any>('/api/v1/admin/certificates')
            .then((data) => {
                const items: any[] = Array.isArray(data) ? data : (data.items || []);
                setAllCerts(items);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const now = new Date();
    const cutoff = new Date(now.getTime() + filterDays * 24 * 60 * 60 * 1000);

    const filteredCerts = allCerts
        .filter((c) => !c.revoked && new Date(c.notAfter) > now && new Date(c.notAfter) <= cutoff)
        .sort((a, b) => new Date(a.notAfter).getTime() - new Date(b.notAfter).getTime());

    const grouped: Record<string, any[]> = {};
    filteredCerts.forEach((c) => {
        const mk = monthKey(c.notAfter);
        if (!grouped[mk]) grouped[mk] = [];
        grouped[mk].push(c);
    });

    const sortedMonths = Object.keys(grouped).sort();

    const expiryStatus = (days: number): 'active' | 'expired' | 'revoked' => {
        if (days > 30) return 'active';
        if (days >= 7) return 'expired';
        return 'revoked';
    };

    const expiryColorClass = (days: number): string => {
        if (days > 30) return 'border-l-green-500';
        if (days >= 7) return 'border-l-yellow-500';
        return 'border-l-red-500';
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expiry Calendar</h1>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Expiring within:</span>
                    <select
                        value={filterDays}
                        onChange={(e) => setFilterDays(parseInt(e.target.value))}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    >
                        {FILTER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading certificates...</div>}
            {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}

            {!loading && !error && filteredCerts.length === 0 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                    <p className="text-sm text-gray-600">No certificates expiring within {filterDays} days</p>
                </div>
            )}

            {!loading && !error && sortedMonths.map((mk) => (
                <div key={mk} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{monthLabel(mk)}</h2>
                        <span className="text-xs text-gray-600">{grouped[mk].length} certificate{grouped[mk].length !== 1 ? 's' : ''}</span>
                    </div>
                    {grouped[mk].map((cert) => {
                        const key = cert.serialNumber || cert.certificateId;
                        const expanded = expandedKey === key;
                        const days = daysUntil(cert.notAfter);
                        return (
                            <div key={key} className={`border-b border-gray-300 dark:border-gray-700 last:border-b-0 border-l-4 ${expiryColorClass(days)}`}>
                                <button onClick={() => setExpandedKey(expanded ? null : key)}
                                    className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                                    <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                                    <StatusBadge status={expiryStatus(days)} label={days <= 0 ? 'Expired' : `${days}d`} />
                                    <span className="text-sm text-gray-900 dark:text-white truncate">{cert.subjectDN}</span>
                                    <span className="font-mono text-xs text-gray-600 hidden sm:inline">{cert.serialNumber?.substring(0, 16)}...</span>
                                    <span className="ml-auto text-xs text-gray-600 flex-shrink-0">{formatDate(cert.notAfter)}</span>
                                </button>
                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                        <DetailField label="Serial" value={cert.serialNumber} mono />
                                        <DetailField label="Subject" value={cert.subjectDN} />
                                        <DetailField label="Issuer" value={cert.issuer} />
                                        <DetailField label="Not Before" value={formatDate(cert.notBefore)} />
                                        <DetailField label="Not After" value={formatDate(cert.notAfter)} />
                                        <DetailField label="Days Until Expiry" value={days <= 0 ? 'Expired' : `${days} days`} />
                                        <DetailField label="Key Algorithm" value={cert.keyAlgorithm} />
                                        <DetailField label="Signature Algorithm" value={cert.signatureAlgorithm} />
                                        <DetailField label="SANs" value={cert.subjectAlternativeNames?.join(', ')} />
                                        <DetailField label="Thumbprints" value={cert.thumbprints} mono />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}

            {/* Legend */}
            {!loading && !error && filteredCerts.length > 0 && (
                <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block"></span> &gt;30 days</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block"></span> 7-30 days</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"></span> &lt;7 days</span>
                </div>
            )}
        </div>
    );
};

export default ExpiryCalendar;
