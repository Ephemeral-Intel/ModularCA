import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet } from '../api/client';

const MIN_HEIGHT = 36;
const DEFAULT_HEIGHT = 220;
const MAX_HEIGHT_RATIO = 0.6;

const LogPanel: React.FC = () => {
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [collapsed, setCollapsed] = useState(true);
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [filter, setFilter] = useState('');
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startY: number; startH: number } | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const [general, est, scep, cmp, acme, network] = await Promise.all([
                apiGet<any>('/api/v1/admin/audit?pageSize=50').catch(() => ({ items: [] })),
                apiGet<any>('/api/v1/admin/audit/est?pageSize=50').catch(() => ({ items: [] })),
                apiGet<any>('/api/v1/admin/audit/scep?pageSize=50').catch(() => ({ items: [] })),
                apiGet<any>('/api/v1/admin/audit/cmp?pageSize=50').catch(() => ({ items: [] })),
                apiGet<any>('/api/v1/admin/audit/acme?pageSize=50').catch(() => ({ items: [] })),
                apiGet<any>('/api/v1/admin/audit/network?pageSize=50').catch(() => ({ items: [] })),
            ]);

            const tagged = [
                ...(general.items || []).map((l: any) => ({ ...l, _source: 'App', _action: l.actionType, _actor: l.actorUsername })),
                ...(est.items || []).map((l: any) => ({ ...l, _source: 'EST', _action: l.operation, _actor: l.subjectDN })),
                ...(scep.items || []).map((l: any) => ({ ...l, _source: 'SCEP', _action: l.operation, _actor: l.subjectDN })),
                ...(cmp.items || []).map((l: any) => ({ ...l, _source: 'CMP', _action: l.messageType || l.operation, _actor: l.subjectDN })),
                ...(acme.items || []).map((l: any) => ({ ...l, _source: 'ACME', _action: l.operation, _actor: l.subjectDN || (l.accountId ? `acct:${l.accountId.substring(0, 8)}` : '') })),
                ...(network.items || []).map((l: any) => ({ ...l, _source: 'Network', _action: l.reason, _actor: l.sourceIp, success: false })),
            ];

            tagged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setLogs(tagged.slice(0, 100));
        } catch {
            // Audit DB might not be configured
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!collapsed) fetchLogs();
    }, [collapsed, fetchLogs]);

    useEffect(() => {
        if (!collapsed && autoRefresh) {
            const interval = setInterval(fetchLogs, 10000);
            return () => clearInterval(interval);
        }
    }, [collapsed, autoRefresh, fetchLogs]);

    const onMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        dragRef.current = { startY: e.clientY, startH: height };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!dragRef.current) return;
        const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
        const delta = dragRef.current.startY - e.clientY;
        const newH = Math.min(maxH, Math.max(MIN_HEIGHT + 40, dragRef.current.startH + delta));
        setHeight(newH);
    }, []);

    const onMouseUp = useCallback(() => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    const toggleCollapse = () => {
        if (collapsed) {
            setHeight(DEFAULT_HEIGHT);
        }
        setCollapsed(!collapsed);
    };

    const formatTime = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + formatTime(ts);
    };

    const filteredLogs = filter
        ? logs.filter(l =>
            (l._source || '').toLowerCase().includes(filter.toLowerCase()) ||
            (l._action || '').toLowerCase().includes(filter.toLowerCase()) ||
            (l._actor || '').toLowerCase().includes(filter.toLowerCase()) ||
            (l.targetEntityType || '').toLowerCase().includes(filter.toLowerCase()) ||
            (l.certificateSerial || '').toLowerCase().includes(filter.toLowerCase())
        )
        : logs;

    return (
        <div
            ref={panelRef}
            className="flex-shrink-0 bg-white dark:bg-gray-950 border-t border-gray-300 dark:border-gray-700 flex flex-col"
            style={{ height: collapsed ? MIN_HEIGHT : height }}
        >
            {/* Resize handle */}
            {!collapsed && (
                <div
                    onMouseDown={onMouseDown}
                    className="h-1 cursor-ns-resize bg-gray-100 dark:bg-gray-800 hover:bg-blue-600 transition-colors flex-shrink-0"
                />
            )}

            {/* Header bar */}
            <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
                <button onClick={toggleCollapse} className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                    <span>{collapsed ? '\u25B2' : '\u25BC'}</span>
                    <span>Events</span>
                    {logs.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] text-gray-600">{logs.length}</span>
                    )}
                </button>

                {!collapsed && (
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filter..."
                            className="px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white w-40 focus:outline-none focus:border-blue-500"
                        />
                        <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="w-3 h-3"
                            />
                            Auto
                        </label>
                        <button
                            onClick={fetchLogs}
                            disabled={loading}
                            className="text-[10px] text-gray-600 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            {loading ? '\u27F3' : '\u21BB'} Refresh
                        </button>
                    </div>
                )}
            </div>

            {/* Log entries */}
            {!collapsed && (
                <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed">
                    {filteredLogs.length === 0 && !loading && (
                        <div className="p-3 text-xs text-gray-600 text-center">No events</div>
                    )}
                    <table className="w-full min-w-[600px]">
                        <tbody>
                            {filteredLogs.map((log) => {
                                const sourceColors: Record<string, string> = {
                                    App: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
                                    EST: 'text-emerald-400 bg-emerald-900/30',
                                    SCEP: 'text-orange-800 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30',
                                    CMP: 'text-cyan-400 bg-cyan-900/30',
                                    ACME: 'text-purple-400 bg-purple-900/30',
                                    Network: 'text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
                                };
                                return (
                                <tr
                                    key={log.id}
                                    onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                                    className={`cursor-pointer border-b border-gray-900 transition-colors ${
                                        selectedLog?.id === log.id ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50/50 dark:hover:bg-gray-900/50'
                                    }`}
                                >
                                    <td className="px-2 py-1 text-gray-600 whitespace-nowrap w-[130px]">
                                        {formatDate(log.timestamp)}
                                    </td>
                                    <td className="px-2 py-1 whitespace-nowrap w-[18px]">
                                        {log.success
                                            ? <span className="text-green-500">{'\u2713'}</span>
                                            : <span className="text-red-800 dark:text-red-400">{'\u2717'}</span>
                                        }
                                    </td>
                                    <td className="px-1 py-1 whitespace-nowrap w-[50px]">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${sourceColors[log._source] || 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'}`}>
                                            {log._source}
                                        </span>
                                    </td>
                                    <td className="px-2 py-1 text-blue-800 dark:text-blue-400 whitespace-nowrap w-[100px] truncate">
                                        {log._actor || '-'}
                                    </td>
                                    <td className="px-2 py-1 text-yellow-800 dark:text-yellow-300 whitespace-nowrap w-[160px]">
                                        {log._action}
                                    </td>
                                    <td className="px-2 py-1 text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                                        {log._source === 'App'
                                            ? `${log.targetEntityType || ''}${log.targetEntityId ? ` ${log.targetEntityId.substring(0, 8)}` : ''}`
                                            : (log.certificateSerial || log.caLabel || '')
                                        }
                                    </td>
                                    <td className="px-2 py-1 text-gray-600 whitespace-nowrap w-[100px]">
                                        {log.sourceIp}
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Detail pane for selected log */}
                    {selectedLog && (
                        <div className="border-t border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 space-y-1">
                            <div className="flex justify-between items-start">
                                <span className="text-xs font-semibold text-gray-900 dark:text-white">{selectedLog._source}: {selectedLog._action}</span>
                                <button onClick={() => setSelectedLog(null)} className="text-gray-600 hover:text-gray-900 dark:hover:text-white text-xs">{'\u2715'}</button>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                                <span className="text-gray-600">Source</span>
                                <span className="text-gray-700 dark:text-gray-300">{selectedLog._source}</span>
                                <span className="text-gray-600">Timestamp</span>
                                <span className="text-gray-700 dark:text-gray-300">{new Date(selectedLog.timestamp).toISOString()}</span>
                                {selectedLog._source === 'Network' ? (
                                    <>
                                        <span className="text-gray-600">Source IP</span>
                                        <span className="text-red-800 dark:text-red-300 font-mono">{selectedLog.sourceIp}</span>
                                        <span className="text-gray-600">Method</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog.httpMethod}</span>
                                        <span className="text-gray-600">Path</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog.requestPath}</span>
                                        <span className="text-gray-600">Protocol</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog.protocol || '-'}</span>
                                        {selectedLog.caLabel && (
                                            <>
                                                <span className="text-gray-600">CA Label</span>
                                                <span className="text-gray-700 dark:text-gray-300">{selectedLog.caLabel}</span>
                                            </>
                                        )}
                                        <span className="text-gray-600">Reason</span>
                                        <span className="text-red-800 dark:text-red-400">{selectedLog.reason}</span>
                                        <span className="text-gray-600">User Agent</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog.userAgent || '-'}</span>
                                    </>
                                ) : selectedLog._source === 'App' ? (
                                    <>
                                        <span className="text-gray-600">Actor</span>
                                        <span className="text-blue-800 dark:text-blue-400">{selectedLog.actorUsername || '-'}</span>
                                        <span className="text-gray-600">Action</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog.actionType}</span>
                                        <span className="text-gray-600">Target</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog.targetEntityType} {selectedLog.targetEntityId || ''}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-gray-600">Operation</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog._action}</span>
                                        <span className="text-gray-600">Subject DN</span>
                                        <span className="text-gray-700 dark:text-gray-300">{selectedLog.subjectDN || '-'}</span>
                                        <span className="text-gray-600">Certificate</span>
                                        <span className="text-gray-700 dark:text-gray-300 font-mono">{selectedLog.certificateSerial || '-'}</span>
                                        {selectedLog.keyAlgorithm && (
                                            <>
                                                <span className="text-gray-600">Key</span>
                                                <span className="text-gray-700 dark:text-gray-300">{selectedLog.keyAlgorithm} {selectedLog.keySize}</span>
                                            </>
                                        )}
                                        {selectedLog.caLabel && (
                                            <>
                                                <span className="text-gray-600">CA Label</span>
                                                <span className="text-gray-700 dark:text-gray-300">{selectedLog.caLabel}</span>
                                            </>
                                        )}
                                    </>
                                )}
                                <span className="text-gray-600">Source IP</span>
                                <span className="text-gray-700 dark:text-gray-300">{selectedLog.sourceIp || '-'}</span>
                                <span className="text-gray-600">Success</span>
                                <span className={selectedLog.success ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'}>{selectedLog.success ? 'Yes' : 'No'}</span>
                                {selectedLog.errorMessage && (
                                    <>
                                        <span className="text-gray-600">Error</span>
                                        <span className="text-red-800 dark:text-red-400">{selectedLog.errorMessage}</span>
                                    </>
                                )}
                                <span className="text-gray-600">ID</span>
                                <span className="text-gray-600 font-mono">{selectedLog.id}</span>
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
            )}
        </div>
    );
};

export default LogPanel;
