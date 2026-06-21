import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../api/client';
import { useToast } from '../context/ToastContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VulnerabilitySummary {
    critical: number;
    warning: number;
    info: number;
    resolved: number;
}

interface Vulnerability {
    id: string;
    severity: 'Critical' | 'Warning' | 'Info';
    type: string;
    description: string;
    certificateSerial: string;
    certificateId: string;
    detectedAt: string;
    resolvedAt: string | null;
    resolved: boolean;
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
        hour: '2-digit',
        minute: '2-digit',
    });
}

function severityColor(severity: string): string {
    switch (severity) {
        case 'Critical': return 'bg-red-600 text-gray-900 dark:text-white';
        case 'Warning': return 'bg-amber-600 text-gray-900 dark:text-white';
        case 'Info': return 'bg-blue-600 text-gray-900 dark:text-white';
        default: return 'bg-gray-600 text-gray-900 dark:text-white';
    }
}

function truncate(text: string, max: number): string {
    if (!text) return '-';
    return text.length > max ? text.substring(0, max) + '...' : text;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatCard: React.FC<{
    label: string;
    value: number;
    color: string;
    sub?: string;
}> = ({ label, value, color, sub }) => (
    <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 flex flex-col">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`text-2xl font-bold mt-1 ${color}`}>{value}</span>
        {sub && <span className="text-[10px] text-gray-600 mt-0.5">{sub}</span>}
    </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const Vulnerabilities: React.FC = () => {
    const { showToast } = useToast();
    const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
    const [summary, setSummary] = useState<VulnerabilitySummary>({ critical: 0, warning: 0, info: 0, resolved: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [severityFilter, setSeverityFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [showResolved, setShowResolved] = useState(false);

    // Expandable detail
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Resolve in-progress tracking
    const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Backend returns the paginated envelope `{ items, totalCount, page, pageSize, totalPages }`
            // — extract `items`, falling back to a raw array for any future endpoint that returns
            // unwrapped. Was P0 #2 from the 2026-04-23 audit; the page silently rendered empty
            // before this fix because Array.isArray(envelope) is false.
            const [vulnsResp, sum] = await Promise.all([
                apiGet<{ items?: Vulnerability[] } | Vulnerability[]>('/api/v1/admin/vulnerabilities'),
                apiGet<VulnerabilitySummary>('/api/v1/admin/vulnerabilities/summary'),
            ]);
            const items = Array.isArray(vulnsResp) ? vulnsResp : (vulnsResp?.items ?? []);
            setVulnerabilities(items);
            setSummary(sum);
        } catch (e: any) {
            setError(e.message || 'Failed to load vulnerabilities');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Derive unique types for filter dropdown
    const uniqueTypes = Array.from(new Set(vulnerabilities.map(v => v.type))).sort();

    // Apply filters
    const filtered = vulnerabilities.filter(v => {
        if (!showResolved && v.resolved) return false;
        if (severityFilter !== 'all' && v.severity !== severityFilter) return false;
        if (typeFilter !== 'all' && v.type !== typeFilter) return false;
        return true;
    });

    const handleResolve = async (id: string) => {
        setResolvingIds(prev => new Set(prev).add(id));
        try {
            await apiPost(`/api/v1/admin/vulnerabilities/${id}/resolve`);
            await fetchData();
        } catch (e: any) {
            showToast('error', e.message || 'Failed to resolve vulnerability');
        } finally {
            setResolvingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // ----- Render -----
    if (loading) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Vulnerabilities</h1>
                <div className="text-gray-600 dark:text-gray-400">Loading vulnerability data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Vulnerabilities</h1>
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-4 text-red-800 dark:text-red-300">{error}</div>
            </div>
        );
    }

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vulnerabilities</h1>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Critical" value={summary.critical} color="text-red-800 dark:text-red-400" />
                <StatCard label="Warning" value={summary.warning} color="text-amber-800 dark:text-amber-400" />
                <StatCard label="Info" value={summary.info} color="text-blue-800 dark:text-blue-400" />
                <StatCard label="Resolved" value={summary.resolved} color="text-green-800 dark:text-green-400" />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center">
                <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                    <option value="all">All Severities</option>
                    <option value="Critical">Critical</option>
                    <option value="Warning">Warning</option>
                    <option value="Info">Info</option>
                </select>

                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                    <option value="all">All Types</option>
                    {uniqueTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showResolved}
                        onChange={(e) => setShowResolved(e.target.checked)}
                        className="rounded bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    Show resolved
                </label>
            </div>

            {/* Vulnerabilities Table */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Findings ({filtered.length})
                    </h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-xs">
                        <thead>
                            <tr className="text-gray-600 dark:text-gray-400 border-b border-gray-300 dark:border-gray-700">
                                <th className="text-left py-2 px-3 font-semibold w-8"></th>
                                <th className="text-left py-2 px-3 font-semibold">Severity</th>
                                <th className="text-left py-2 px-3 font-semibold">Type</th>
                                <th className="text-left py-2 px-3 font-semibold">Description</th>
                                <th className="text-left py-2 px-3 font-semibold">Certificate</th>
                                <th className="text-left py-2 px-3 font-semibold">Detected</th>
                                <th className="text-right py-2 px-3 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-6 text-center text-gray-600">
                                        No vulnerabilities found
                                    </td>
                                </tr>
                            )}
                            {filtered.map(v => {
                                const isExpanded = expandedId === v.id;
                                return (
                                    <React.Fragment key={v.id}>
                                        <tr
                                            className={`border-b border-gray-300 dark:border-gray-700/50 hover:bg-gray-200/30 dark:bg-gray-700/30 transition-colors cursor-pointer ${v.resolved ? 'opacity-60' : ''}`}
                                            onClick={() => setExpandedId(isExpanded ? null : v.id)}
                                        >
                                            <td className="py-2 px-3 text-gray-600">
                                                {isExpanded ? '\u25BC' : '\u25B6'}
                                            </td>
                                            <td className="py-2 px-3">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${severityColor(v.severity)}`}>
                                                    {v.severity}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-gray-800 dark:text-gray-200">{v.type}</td>
                                            <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-[300px] truncate" title={v.description}>
                                                {truncate(v.description, 80)}
                                            </td>
                                            <td className="py-2 px-3 font-mono text-gray-600 dark:text-gray-400 max-w-[120px] truncate" title={v.certificateSerial}>
                                                {v.certificateSerial ? v.certificateSerial.substring(0, 16) + '...' : '-'}
                                            </td>
                                            <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                {formatDate(v.detectedAt)}
                                            </td>
                                            <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                {!v.resolved && (
                                                    <button
                                                        onClick={() => handleResolve(v.id)}
                                                        disabled={resolvingIds.has(v.id)}
                                                        className="px-2 py-1 text-[10px] bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700 rounded hover:bg-green-900 transition-colors disabled:opacity-50"
                                                    >
                                                        {resolvingIds.has(v.id) ? 'Resolving...' : 'Resolve'}
                                                    </button>
                                                )}
                                                {v.resolved && (
                                                    <span className="text-[10px] text-green-500">Resolved</span>
                                                )}
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-gray-50/50 dark:bg-gray-900/50">
                                                <td colSpan={7} className="px-6 py-4">
                                                    <div className="space-y-2">
                                                        <div>
                                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Full Description</span>
                                                            <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{v.description}</p>
                                                        </div>
                                                        <div className="flex gap-6">
                                                            <div>
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Type</span>
                                                                <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{v.type}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Severity</span>
                                                                <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{v.severity}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Detected</span>
                                                                <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{formatDate(v.detectedAt)}</p>
                                                            </div>
                                                            {v.resolvedAt && (
                                                                <div>
                                                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Resolved</span>
                                                                    <p className="text-sm text-green-800 dark:text-green-400 mt-1">{formatDate(v.resolvedAt)}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {v.certificateId && (
                                                            <div>
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Certificate</span>
                                                                <p className="text-sm mt-1">
                                                                    <a
                                                                        href={`/admin/certificates?search=${encodeURIComponent(v.certificateSerial || v.certificateId)}`}
                                                                        className="text-blue-800 dark:text-blue-400 hover:text-blue-300 underline font-mono"
                                                                    >
                                                                        {v.certificateSerial || v.certificateId}
                                                                    </a>
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Vulnerabilities;
