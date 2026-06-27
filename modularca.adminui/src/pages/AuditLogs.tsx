import React, { useState, useEffect } from 'react';
import { apiGet } from '../api/client';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TABS = ['General', 'EST', 'SCEP', 'CMP', 'ACME', 'Network'] as const;
type Tab = typeof TABS[number];

const AuditLogs: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('General');
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterCaId, setFilterCaId] = useState('');
    const [filterActionType, setFilterActionType] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [knownActionTypes, setKnownActionTypes] = useState<string[]>([]);
    const pageSize = 25;

    // Fetch CAs for the filter dropdown
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

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (dateFrom) params.set('from', dateFrom);
        if (dateTo) params.set('to', dateTo);
        if (filterCaId) params.set('caId', filterCaId);
        if (filterActionType) params.set('actionType', filterActionType);
        if (filterUser) params.set('user', filterUser);

        const path = activeTab === 'General'
            ? `/api/v1/admin/audit?${params}`
            : `/api/v1/admin/audit/${activeTab.toLowerCase()}?${params}`;

        apiGet<any>(path)
            .then((data) => {
                if (cancelled) return;
                const items = Array.isArray(data) ? data : (data.items || []);
                const total = data.totalPages || Math.ceil((data.totalCount || items.length) / pageSize) || 1;
                setLogs(items);
                setTotalPages(total);
                setLoading(false);

                // Collect unique action types for the filter dropdown
                if (activeTab === 'General') {
                    const types = new Set(knownActionTypes);
                    for (const log of items) {
                        if (log.actionType) types.add(log.actionType);
                    }
                    const sorted = Array.from(types).sort();
                    if (sorted.length !== knownActionTypes.length) {
                        setKnownActionTypes(sorted);
                    }
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load audit logs');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [activeTab, page, dateFrom, dateTo, filterCaId, filterActionType, filterUser]);

    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        setPage(1);
        setExpandedKey(null);
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-300 dark:border-gray-700">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab
                            ? 'text-blue-800 dark:text-blue-400 border-blue-400'
                            : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-700 dark:text-gray-300'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* CA Filter & Date Range Filters */}
            <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">CA:</label>
                    <select
                        value={filterCaId}
                        onChange={(e) => { setFilterCaId(e.target.value); setPage(1); }}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    >
                        <option value="">All CAs</option>
                        {authorities.map((ca) => (
                            <option key={ca.id} value={ca.id}>{ca.label || ca.commonName || ca.id}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">From:</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">To:</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                </div>
                {activeTab === 'General' && (
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600 dark:text-gray-400">Action:</label>
                        <select
                            value={filterActionType}
                            onChange={(e) => { setFilterActionType(e.target.value); setPage(1); }}
                            className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="">All Actions</option>
                            {knownActionTypes.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">User:</label>
                    <input
                        type="text"
                        value={filterUser}
                        onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
                        placeholder="Username"
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 w-36"
                    />
                </div>
                {(dateFrom || dateTo || filterCaId || filterActionType || filterUser) && (
                    <button
                        onClick={() => { setDateFrom(''); setDateTo(''); setFilterCaId(''); setFilterActionType(''); setFilterUser(''); setPage(1); }}
                        className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white dark:text-white transition-colors"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* Log List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{activeTab} Audit Logs</h3>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && logs.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No audit entries found</div>
                    )}
                    {!loading && !error && logs.map((log) => {
                        const key = log.id || `${log.timestamp}-${log.actionType || log.operation}`;
                        const expanded = expandedKey === key;
                        const isProtocol = activeTab !== 'General' && activeTab !== 'Network';
                        const isNetwork = activeTab === 'Network';

                        return (
                            <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedKey(expanded ? null : key)}
                                    className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                                    <span className="text-gray-600 text-xs min-w-[140px]">{formatDate(log.timestamp)}</span>
                                    {isNetwork ? (
                                        <>
                                            {log.blocked ? (
                                                <StatusBadge status="revoked" label="BLOCKED" />
                                            ) : log.statusCode >= 400 ? (
                                                <StatusBadge status="expired" label={`${log.statusCode}`} />
                                            ) : (
                                                <StatusBadge status="active" label={`${log.statusCode}`} />
                                            )}
                                            <span className={`${log.blocked ? 'text-red-800 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'} text-xs font-mono`}>{log.sourceIp}</span>
                                            <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">{log.httpMethod}</span>
                                            <span className="text-gray-600 dark:text-gray-400 text-xs truncate max-w-[200px]">{log.requestPath}</span>
                                            {log.protocol && <StatusBadge status="pending" label={log.protocol} />}
                                            {log.caLabel && <span className="text-cyan-400 text-xs">{log.caLabel}</span>}
                                            {log.reason && <StatusBadge status="expired" label={log.reason} />}
                                        </>
                                    ) : (
                                        <>
                                            <StatusBadge status={log.success ? 'active' : 'revoked'} label={log.success ? 'OK' : 'FAIL'} />
                                            {isProtocol ? (
                                                <>
                                                    <StatusBadge status="pending" label={activeTab} />
                                                    <span className="text-purple-300 text-xs font-medium">{log.operation || log.messageType}</span>
                                                    <span className="text-gray-600 dark:text-gray-400 text-xs truncate max-w-[250px]">{log.subjectDN || ''}</span>
                                                    {log.certificateSerial && (
                                                        <span className="ml-auto text-xs text-gray-600 font-mono">{log.certificateSerial}</span>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <StatusBadge status="pending" label="App" />
                                                    <span className="text-blue-800 dark:text-blue-300 text-xs">{log.actorUsername || 'system'}</span>
                                                    <span className="text-gray-600 dark:text-gray-400 text-xs">{log.actionType}</span>
                                                    <span className="ml-auto text-xs text-gray-600 truncate max-w-[200px]">
                                                        {log.targetEntityType} {log.targetEntityId ? `#${log.targetEntityId.substring(0, 8)}` : ''}
                                                    </span>
                                                </>
                                            )}
                                        </>
                                    )}
                                </button>
                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                        {isNetwork ? (
                                            <>
                                                <DetailField label="Timestamp" value={formatDate(log.timestamp)} />
                                                <DetailField label="Source IP" value={log.sourceIp} />
                                                <DetailField label="HTTP Method" value={log.httpMethod} />
                                                <DetailField label="Request Path" value={log.requestPath} />
                                                <DetailField label="Protocol" value={log.protocol} />
                                                <DetailField label="CA Label" value={log.caLabel} />
                                                <DetailField label="Reason" value={log.reason} />
                                                <DetailField label="Status Code" value={log.statusCode?.toString()} />
                                                <DetailField label="Blocked" value={log.blocked ? 'Yes' : 'No'} />
                                                {log.responseTimeMs != null && <DetailField label="Response Time" value={`${log.responseTimeMs}ms`} />}
                                                <DetailField label="User Agent" value={log.userAgent} />
                                            </>
                                        ) : isProtocol ? (
                                            <>
                                                <DetailField label="Protocol" value={activeTab} />
                                                <DetailField label="Operation" value={log.operation || log.messageType} />
                                                <DetailField label="Subject DN" value={log.subjectDN} />
                                                <DetailField label="Certificate Serial" value={log.certificateSerial} mono />
                                                <DetailField label="Key Algorithm" value={log.keyAlgorithm} />
                                                <DetailField label="Key Size" value={log.keySize} />
                                                <DetailField label="CA Label" value={log.caLabel} />
                                                <DetailField label="Source IP" value={log.sourceIp} />
                                                <DetailField label="Timestamp" value={formatDate(log.timestamp)} />
                                                <DetailField label="Success" value={log.success ? 'Yes' : 'No'} />
                                                <DetailField label="Error" value={log.errorMessage} />
                                                {/* ACME-specific fields */}
                                                {log.accountId && <DetailField label="Account ID" value={log.accountId} mono />}
                                                {log.orderId && <DetailField label="Order ID" value={log.orderId} mono />}
                                                {log.identifiers && <DetailField label="Identifiers" value={log.identifiers} />}
                                                {log.revocationReason && <DetailField label="Revocation Reason" value={log.revocationReason} />}
                                                {/* CMP-specific fields */}
                                                {log.transactionId && <DetailField label="Transaction ID" value={log.transactionId} mono />}
                                            </>
                                        ) : (
                                            <>
                                                <DetailField label="Source" value="Application" />
                                                <DetailField label="Action" value={log.actionType} />
                                                <DetailField label="Actor" value={`${log.actorUsername || 'N/A'} (${log.actorUserId || 'N/A'})`} />
                                                <DetailField label="Timestamp" value={formatDate(log.timestamp)} />
                                                <DetailField label="Target Type" value={log.targetEntityType} />
                                                <DetailField label="Target ID" value={log.targetEntityId} mono />
                                                <DetailField label="Source IP" value={log.sourceIp} />
                                                <DetailField label="Success" value={log.success ? 'Yes' : 'No'} />
                                                <DetailField label="Error" value={log.errorMessage} />
                                                <DetailField label="Details" value={log.detailsJson} />
                                            </>
                                        )}
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
        </div>
    );
};

export default AuditLogs;
