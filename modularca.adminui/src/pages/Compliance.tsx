import React, { useState } from 'react';
import { apiPost, apiBlob } from '../api/client';
import { useToast } from '../context/ToastContext';

// ---------------------------------------------------------------------------
// Types — matching the C# ComplianceReport response model
// ---------------------------------------------------------------------------

interface AlgorithmDistributionEntry {
    algorithm: string;
    keySize: string;
    count: number;
}

interface VulnerabilitySummary {
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    totalUnresolved: number;
}

interface ExpiryForecast {
    within30Days: number;
    within60Days: number;
    within90Days: number;
    within180Days: number;
    within365Days: number;
}

interface IssuanceHistoryEntry {
    serialNumber: string;
    subjectDN: string;
    issuer: string;
    validFrom: string;
    notAfter: string;
}

interface RevocationHistoryEntry {
    serialNumber: string;
    subjectDN: string;
    issuer: string;
    revocationDate: string;
    revocationReason: string;
}

interface ComplianceReport {
    generatedAt: string;
    fromDate: string;
    toDate: string;
    caId: string | null;
    inventory: {
        total: number;
        active: number;
        expired: number;
        revoked: number;
    };
    algorithmDistribution: AlgorithmDistributionEntry[];
    vulnerabilitySummary: VulnerabilitySummary;
    expiryForecast: ExpiryForecast;
    issuanceHistory: IssuanceHistoryEntry[];
    revocationHistory: RevocationHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatDateTime(d: string | null): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function toISODate(d: Date): string {
    return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <div className="p-4">{children}</div>
    </div>
);

const StatCard: React.FC<{
    label: string;
    value: number | string;
    color: string;
}> = ({ label, value, color }) => (
    <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 flex flex-col">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`text-2xl font-bold mt-1 ${color}`}>{value}</span>
    </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const Compliance: React.FC = () => {
    const { showToast } = useToast();
    // Default range: last 30 days
    const defaultTo = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const [dateFrom, setDateFrom] = useState(toISODate(defaultFrom));
    const [dateTo, setDateTo] = useState(toISODate(defaultTo));
    const [caFilter, setCaFilter] = useState('');
    const [report, setReport] = useState<ComplianceReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        try {
            const body: any = { fromDate: dateFrom, toDate: dateTo };
            if (caFilter.trim()) body.caId = caFilter.trim();
            const data = await apiPost<ComplianceReport>('/api/v1/admin/compliance/report', body);
            setReport(data);
        } catch (e: any) {
            setError(e.message || 'Failed to generate report');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCsv = async () => {
        setExporting(true);
        try {
            // Route through apiBlob so auth + CSRF + refresh
            // handling is identical to every other request.
            const body: any = { fromDate: dateFrom, toDate: dateTo };
            if (caFilter.trim()) body.caId = caFilter.trim();

            const resp = await apiBlob('/api/v1/admin/compliance/export/csv', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `compliance-report-${dateFrom}-to-${dateTo}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            showToast('error', e.message || 'CSV export failed');
        } finally {
            setExporting(false);
        }
    };

    // Algorithm distribution bar chart data
    const algoEntries = report?.algorithmDistribution ?? [];
    const algoMax = algoEntries.length > 0 ? Math.max(...algoEntries.map(e => e.count)) : 0;
    const algoTotal = algoEntries.reduce((s, e) => s + e.count, 0);

    // Expiry forecast entries for rendering
    const forecastEntries = report ? [
        { label: '30 days', count: report.expiryForecast.within30Days },
        { label: '60 days', count: report.expiryForecast.within60Days },
        { label: '90 days', count: report.expiryForecast.within90Days },
        { label: '180 days', count: report.expiryForecast.within180Days },
        { label: '365 days', count: report.expiryForecast.within365Days },
    ] : [];
    const forecastMax = forecastEntries.length > 0 ? Math.max(...forecastEntries.map(e => e.count), 1) : 1;

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Compliance Reports</h1>

            {/* Report Parameters */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-600 dark:text-gray-400">From</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-400 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-600 dark:text-gray-400">To</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-400 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-600 dark:text-gray-400">CA Filter (optional)</label>
                        <input
                            type="text"
                            placeholder="CA ID..."
                            value={caFilter}
                            onChange={(e) => setCaFilter(e.target.value)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-400 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 min-w-[200px]"
                        />
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {loading && (
                            <svg className="animate-spin h-4 w-4 text-gray-900 dark:text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        )}
                        {loading ? 'Generating...' : 'Generate Report'}
                    </button>
                    {report && (
                        <button
                            onClick={handleExportCsv}
                            disabled={exporting}
                            className="px-4 py-2 text-sm bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700 rounded hover:bg-green-900 transition-colors disabled:opacity-50"
                        >
                            {exporting ? 'Exporting...' : 'Export CSV'}
                        </button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-4 text-red-800 dark:text-red-300">{error}</div>
            )}

            {/* Report Content */}
            {report && (
                <div className="space-y-6">
                    {/* Generated header */}
                    <div className="text-xs text-gray-600">
                        Report generated at {formatDateTime(report.generatedAt)} | Period: {formatDate(report.fromDate)} - {formatDate(report.toDate)}
                        {report.caId && <> | CA: {report.caId}</>}
                    </div>

                    {/* Inventory Summary */}
                    <div>
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Inventory Summary</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <StatCard label="Total" value={report.inventory.total} color="text-gray-900 dark:text-white" />
                            <StatCard label="Active" value={report.inventory.active} color="text-green-800 dark:text-green-400" />
                            <StatCard label="Expired" value={report.inventory.expired} color="text-orange-800 dark:text-orange-400" />
                            <StatCard label="Revoked" value={report.inventory.revoked} color="text-red-800 dark:text-red-400" />
                        </div>
                    </div>

                    {/* Algorithm Distribution */}
                    <Section title="Algorithm Distribution">
                        {algoEntries.length === 0 ? (
                            <span className="text-sm text-gray-600">No data</span>
                        ) : (
                            <div className="space-y-1">
                                {algoEntries.map((entry) => {
                                    const pct = algoMax > 0 ? (entry.count / algoMax) * 100 : 0;
                                    const pctOfTotal = algoTotal > 0 ? ((entry.count / algoTotal) * 100).toFixed(1) : '0.0';
                                    const label = entry.keySize ? `${entry.algorithm} ${entry.keySize}` : entry.algorithm;
                                    return (
                                        <div key={label} className="flex items-center gap-3 py-1">
                                            <span className="text-xs text-gray-700 dark:text-gray-300 w-36 truncate text-right">{label}</span>
                                            <div className="flex-1 h-5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="text-xs text-gray-600 dark:text-gray-400 w-20 text-right tabular-nums">
                                                {entry.count} ({pctOfTotal}%)
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Section>

                    {/* Vulnerability Summary */}
                    <div>
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Vulnerability Summary</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <StatCard label="Critical" value={report.vulnerabilitySummary.bySeverity?.['Critical'] ?? 0} color="text-red-800 dark:text-red-400" />
                            <StatCard label="Warning" value={report.vulnerabilitySummary.bySeverity?.['Warning'] ?? 0} color="text-amber-800 dark:text-amber-400" />
                            <StatCard label="Info" value={report.vulnerabilitySummary.bySeverity?.['Info'] ?? 0} color="text-blue-800 dark:text-blue-400" />
                            <StatCard label="Total Unresolved" value={report.vulnerabilitySummary.totalUnresolved} color="text-orange-800 dark:text-orange-400" />
                        </div>
                    </div>

                    {/* Expiry Forecast */}
                    <Section title="Expiry Forecast">
                        <div className="space-y-1">
                            {forecastEntries.map(item => {
                                const pct = forecastMax > 0 ? (item.count / forecastMax) * 100 : 0;
                                return (
                                    <div key={item.label} className="flex items-center gap-3 py-1">
                                        <span className="text-xs text-gray-700 dark:text-gray-300 w-28 text-right">Within {item.label}</span>
                                        <div className="flex-1 h-5 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                                            <div className="h-full bg-amber-500 rounded" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-gray-600 dark:text-gray-400 w-10 text-right tabular-nums">{item.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Recent Issuances */}
                        <Section title="Recent Issuances">
                            {(!report.issuanceHistory || report.issuanceHistory.length === 0) ? (
                                <span className="text-sm text-gray-600">No recent issuances</span>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[600px] text-xs">
                                        <thead>
                                            <tr className="text-gray-600 dark:text-gray-400 border-b border-gray-300 dark:border-gray-700">
                                                <th className="text-left py-2 px-2 font-semibold">Subject</th>
                                                <th className="text-left py-2 px-2 font-semibold">Serial</th>
                                                <th className="text-left py-2 px-2 font-semibold">Issuer</th>
                                                <th className="text-right py-2 px-2 font-semibold">Valid From</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {report.issuanceHistory.map((c, i) => (
                                                <tr key={i} className="border-b border-gray-300 dark:border-gray-700/50 hover:bg-gray-200/30 dark:bg-gray-700/30 transition-colors">
                                                    <td className="py-2 px-2 text-gray-800 dark:text-gray-200 max-w-[200px] truncate" title={c.subjectDN}>{c.subjectDN}</td>
                                                    <td className="py-2 px-2 font-mono text-gray-600 dark:text-gray-400 max-w-[120px] truncate" title={c.serialNumber}>
                                                        {c.serialNumber ? c.serialNumber.substring(0, 16) + '...' : '-'}
                                                    </td>
                                                    <td className="py-2 px-2 text-gray-600 dark:text-gray-400 max-w-[160px] truncate" title={c.issuer}>{c.issuer}</td>
                                                    <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDateTime(c.validFrom)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Section>

                        {/* Recent Revocations */}
                        <Section title="Recent Revocations">
                            {(!report.revocationHistory || report.revocationHistory.length === 0) ? (
                                <span className="text-sm text-gray-600">No recent revocations</span>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[600px] text-xs">
                                        <thead>
                                            <tr className="text-gray-600 dark:text-gray-400 border-b border-gray-300 dark:border-gray-700">
                                                <th className="text-left py-2 px-2 font-semibold">Subject</th>
                                                <th className="text-left py-2 px-2 font-semibold">Serial</th>
                                                <th className="text-left py-2 px-2 font-semibold">Reason</th>
                                                <th className="text-right py-2 px-2 font-semibold">Revoked</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {report.revocationHistory.map((c, i) => (
                                                <tr key={i} className="border-b border-gray-300 dark:border-gray-700/50 hover:bg-gray-200/30 dark:bg-gray-700/30 transition-colors">
                                                    <td className="py-2 px-2 text-gray-800 dark:text-gray-200 max-w-[200px] truncate" title={c.subjectDN}>{c.subjectDN}</td>
                                                    <td className="py-2 px-2 font-mono text-gray-600 dark:text-gray-400 max-w-[120px] truncate" title={c.serialNumber}>
                                                        {c.serialNumber ? c.serialNumber.substring(0, 16) + '...' : '-'}
                                                    </td>
                                                    <td className="py-2 px-2 text-red-800 dark:text-red-400">{c.revocationReason || 'Unspecified'}</td>
                                                    <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDateTime(c.revocationDate)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Section>
                    </div>
                </div>
            )}

            {/* Empty state before generating */}
            {!report && !loading && !error && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-sm">Select a date range and click "Generate Report" to create a compliance report.</p>
                </div>
            )}
        </div>
    );
};

export default Compliance;
