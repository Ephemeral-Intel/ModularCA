import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import ConfirmModal from '../components/ConfirmModal';

interface TrustAnchor {
    id: string;
    subjectDN: string;
    issuer: string;
    serialNumber: string;
    notBefore: string;
    notAfter: string;
    label: string;
    description: string;
    isEnabled: boolean;
    importedByUsername: string;
    importedAt: string;
    thumbprints: string;
}

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parseThumbprints(raw: string | null | undefined): Record<string, string> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {
        // not JSON, return as single entry
    }
    return { thumbprint: raw };
}

/* --- Detail Modal --- */
/// <summary>
/// Detail modal for a trust anchor with toggle and delete actions.
/// Delete now delegates to the parent via onDelete which triggers a ConfirmModal.
/// </summary>
const DetailModal: React.FC<{
    anchor: TrustAnchor;
    onClose: () => void;
    onToggle: (a: TrustAnchor) => void;
    onDelete: (a: TrustAnchor) => void;
}> = ({ anchor, onClose, onToggle, onDelete }) => {
    const thumbprints = parseThumbprints(anchor.thumbprints);

    return (
        <div className="fixed inset-0 bg-black/25 dark:bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{anchor.label || anchor.subjectDN}</h3>
                    <button onClick={onClose} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-900 dark:text-white text-xl">&times;</button>
                </div>
                <div className="p-4 space-y-1">
                    <DetailField label="Label" value={anchor.label} />
                    <DetailField label="Description" value={anchor.description} />
                    <DetailField label="Subject DN" value={anchor.subjectDN} mono />
                    <DetailField label="Issuer" value={anchor.issuer} mono />
                    <DetailField label="Serial Number" value={anchor.serialNumber} mono />
                    <DetailField label="Not Before" value={formatDate(anchor.notBefore)} />
                    <DetailField label="Not After" value={formatDate(anchor.notAfter)} />
                    <DetailField label="Status" value={
                        <StatusBadge status={anchor.isEnabled ? 'enabled' : 'disabled'} />
                    } />
                    <DetailField label="Imported By" value={anchor.importedByUsername} />
                    <DetailField label="Imported At" value={formatDate(anchor.importedAt)} />

                    {Object.keys(thumbprints).length > 0 && (
                        <div className="pt-2">
                            <span className="text-gray-600 text-xs font-semibold uppercase">Thumbprints</span>
                            {Object.entries(thumbprints).map(([algo, value]) => (
                                <DetailField key={algo} label={algo} value={value} mono />
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex gap-2 p-4 border-t border-gray-300 dark:border-gray-700">
                    <button onClick={() => onToggle(anchor)}
                        className={`px-3 py-1.5 text-xs rounded border transition-colors ${anchor.isEnabled
                            ? 'bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-900'
                            : 'bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 hover:bg-green-900'}`}>
                        {anchor.isEnabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => onDelete(anchor)}
                        className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

/* --- Import Form --- */
const ImportForm: React.FC<{ onImported: () => void }> = ({ onImported }) => {
    const [expanded, setExpanded] = useState(false);
    const [certificate, setCertificate] = useState('');
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleImport = async () => {
        setImporting(true);
        setMessage(null);
        try {
            await apiPost('/api/v1/admin/trust-anchors', { certificate, label, description });
            setMessage({ type: 'success', text: 'Trust anchor imported successfully.' });
            setCertificate('');
            setLabel('');
            setDescription('');
            onImported();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to import trust anchor.' });
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg">
            <button onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors rounded-lg">
                <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Import Trust Anchor</span>
            </button>
            {expanded && (
                <div className="px-4 pb-4 space-y-3">
                    <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">PEM Certificate</label>
                        <textarea value={certificate} onChange={(e) => setCertificate(e.target.value)}
                            rows={8}
                            placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white font-mono focus:outline-none focus:border-blue-500 resize-y" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Label</label>
                            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                                placeholder="e.g. External Root CA"
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Description</label>
                            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                                placeholder="Optional description"
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" />
                        </div>
                    </div>

                    {message && (
                        <div className={`text-xs px-3 py-2 rounded border ${message.type === 'success'
                            ? 'bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700'
                            : 'bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700'}`}>
                            {message.text}
                        </div>
                    )}

                    <button onClick={handleImport} disabled={importing || !certificate.trim()}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {importing ? 'Importing...' : 'Import'}
                    </button>
                </div>
            )}
        </div>
    );
};

/* --- Trust Anchors Page --- */
const TrustAnchors: React.FC = () => {
    const { showToast } = useToast();
    const [anchors, setAnchors] = useState<TrustAnchor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedAnchor, setSelectedAnchor] = useState<TrustAnchor | null>(null);

    // Confirm modal state
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/trust-anchors')
            .then((data) => setAnchors(Array.isArray(data) ? data : (data.items || data.trustAnchors || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handleToggle = async (anchor: TrustAnchor) => {
        try {
            await apiPut(`/api/v1/admin/trust-anchors/${anchor.id}/toggle`, { enabled: !anchor.isEnabled });
            setSelectedAnchor(null);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to toggle trust anchor.');
        }
    };

    /// <summary>
    /// Prompts for confirmation before deleting a trust anchor via the ConfirmModal.
    /// </summary>
    const handleDelete = (anchor: TrustAnchor) => {
        setConfirmAction({
            title: 'Delete Trust Anchor',
            message: `Are you sure you want to delete "${anchor.label || anchor.subjectDN}"? This action cannot be undone.`,
            action: async () => {
                await apiDelete(`/api/v1/admin/trust-anchors/${anchor.id}`);
                setSelectedAnchor(null);
                load();
            },
        });
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trust Anchors</h1>

            <ImportForm onImported={load} />

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm text-left">
                    <thead className="border-b border-gray-300 dark:border-gray-700">
                        <tr className="text-xs text-gray-600 dark:text-gray-400 uppercase">
                            <th className="px-4 py-3">Label / Subject</th>
                            <th className="px-4 py-3">Issuer</th>
                            <th className="px-4 py-3">Expiry</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Imported By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-600 dark:text-gray-400">Loading...</td></tr>
                        )}
                        {error && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-red-800 dark:text-red-400">{error}</td></tr>
                        )}
                        {!loading && !error && anchors.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-600">No trust anchors imported</td></tr>
                        )}
                        {!loading && !error && anchors.map((a) => (
                            <tr key={a.id}
                                onClick={() => setSelectedAnchor(a)}
                                className="border-b border-gray-300 dark:border-gray-700 last:border-b-0 hover:bg-gray-200/50 dark:bg-gray-700/50 cursor-pointer transition-colors">
                                <td className="px-4 py-3">
                                    <div className="text-gray-900 dark:text-white font-medium">{a.label || '-'}</div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate max-w-xs">{a.subjectDN}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-xs font-mono truncate max-w-xs">{a.issuer}</td>
                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-xs">{formatDate(a.notAfter)}</td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={a.isEnabled ? 'enabled' : 'disabled'} />
                                </td>
                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-xs">{a.importedByUsername}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedAnchor && (
                <DetailModal
                    anchor={selectedAnchor}
                    onClose={() => setSelectedAnchor(null)}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                />
            )}

            <ConfirmModal
                isOpen={!!confirmAction}
                title={confirmAction?.title || ''}
                message={confirmAction?.message || ''}
                confirmLabel="Delete"
                loading={confirmLoading}
                onConfirm={async () => {
                    if (!confirmAction) return;
                    setConfirmLoading(true);
                    try {
                        await confirmAction.action();
                    } catch (err: any) {
                        showToast('error', err.message || 'Operation failed');
                    } finally {
                        setConfirmLoading(false);
                        setConfirmAction(null);
                    }
                }}
                onCancel={() => setConfirmAction(null)}
            />
        </div>
    );
};

export default TrustAnchors;
