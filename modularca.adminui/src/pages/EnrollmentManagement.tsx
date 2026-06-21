import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete } from '../api/client';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import { generateQrSvg } from '../utils/qrcode';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const EnrollmentManagement: React.FC = () => {
    const [tokens, setTokens] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ expiresInHours: 24, maxUses: 1, subjectRestriction: '', sanRestriction: '', protocol: '' });
    const [newToken, setNewToken] = useState<string | null>(null);

    const loadTokens = async () => {
        setLoading(true);
        try {
            const data = await apiGet<any[]>('/api/v1/admin/enrollment-tokens');
            setTokens(data);
        } catch { }
        setLoading(false);
    };

    useEffect(() => { loadTokens(); }, []);

    const handleGenerate = async () => {
        try {
            const result = await apiPost<any>('/api/v1/admin/enrollment-tokens', {
                expiresInHours: form.expiresInHours,
                maxUses: form.maxUses,
                subjectRestriction: form.subjectRestriction || null,
                sanRestriction: form.sanRestriction || null,
                protocol: form.protocol || null,
            });
            setNewToken(result.token);
            setShowCreate(false);
            loadTokens();
        } catch { }
    };

    const handleRevoke = async (id: string) => {
        await apiDelete(`/api/v1/admin/enrollment-tokens/${id}`);
        loadTokens();
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Enrollment Management</h1>
                <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 text-sm">
                    Generate Token
                </button>
            </div>

            {newToken && (() => {
                const enrollUrl = `${window.location.origin}/api/v1/public/enroll/${newToken}/page`;
                const qrSvg = generateQrSvg(enrollUrl, 4, 4);
                return (
                    <div className="bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded p-4">
                        <p className="text-green-800 dark:text-green-300 text-sm font-semibold mb-1">Token Generated (copy now — shown only once):</p>
                        <code className="text-green-800 dark:text-green-200 text-xs font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded block break-all">{newToken}</code>

                        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <p className="text-gray-700 dark:text-gray-300 text-xs font-semibold mb-2">Enrollment URL</p>
                            <div className="flex items-center gap-2">
                                <code className="text-blue-800 dark:text-blue-300 text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded flex-1 break-all">{enrollUrl}</code>
                                <button
                                    onClick={() => { navigator.clipboard.writeText(enrollUrl); }}
                                    className="px-3 py-1 bg-blue-600 text-gray-900 dark:text-white text-xs rounded hover:bg-blue-700 whitespace-nowrap"
                                >
                                    Copy URL
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col items-center">
                            <p className="text-gray-700 dark:text-gray-300 text-xs font-semibold mb-2">Scan to Enroll</p>
                            <div
                                className="bg-white p-2 rounded-lg inline-block"
                                dangerouslySetInnerHTML={{ __html: qrSvg }}
                            />
                            <p className="text-gray-600 text-xs mt-1">Scan with a mobile device to open the enrollment page</p>
                        </div>

                        <div className="mt-3 flex gap-2">
                            <button onClick={() => { navigator.clipboard.writeText(newToken); }} className="text-xs text-green-800 dark:text-green-400 hover:text-green-300">
                                Copy Token
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(enrollUrl); }} className="text-xs text-blue-800 dark:text-blue-400 hover:text-blue-300">
                                Copy Enrollment URL
                            </button>
                        </div>
                    </div>
                );
            })()}

            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-gray-900 dark:text-white text-sm font-semibold">Generate Enrollment Token</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400">Expires In (hours)</label>
                            <input type="text" inputMode="numeric" value={form.expiresInHours} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setForm({ ...form, expiresInHours: v === '' ? '' as any : +v }); }}
                                className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white rounded px-2 py-1 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400">Max Uses (0=unlimited)</label>
                            <input type="text" inputMode="numeric" value={form.maxUses} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setForm({ ...form, maxUses: v === '' ? '' as any : +v }); }}
                                className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white rounded px-2 py-1 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400">Subject Restriction (optional)</label>
                            <input type="text" value={form.subjectRestriction} onChange={e => setForm({ ...form, subjectRestriction: e.target.value })}
                                className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white rounded px-2 py-1 text-sm" placeholder="e.g., example.com" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400">Protocol (optional)</label>
                            <select value={form.protocol} onChange={e => setForm({ ...form, protocol: e.target.value })}
                                className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white rounded px-2 py-1 text-sm">
                                <option value="">Any</option>
                                <option value="EST">EST</option>
                                <option value="SCEP">SCEP</option>
                                <option value="CMP">CMP</option>
                            </select>
                        </div>
                    </div>
                    <button onClick={handleGenerate} className="px-4 py-1.5 bg-green-600 text-gray-900 dark:text-white rounded text-sm hover:bg-green-700">
                        Generate
                    </button>
                </div>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Active Enrollment Tokens</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {loading && <div className="p-4 text-gray-600 dark:text-gray-400 text-sm text-center">Loading...</div>}
                    {!loading && tokens.length === 0 && <div className="p-4 text-gray-600 text-sm text-center">No active tokens</div>}
                    {tokens.map((t: any) => (
                        <div key={t.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-200/50 dark:bg-gray-700/50" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                                <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                                    <StatusBadge status={t.isRevoked ? 'revoked' : 'active'} />
                                    <span className="font-mono text-xs">{t.token?.substring(0, 20)}...</span>
                                    <span className="text-gray-600">Uses: {t.usesRemaining}/{t.maxUses || '\u221E'}</span>
                                    {t.protocol && <StatusBadge status="pending" label={t.protocol} />}
                                </div>
                                <span className="text-gray-600 dark:text-gray-400 text-xs">{expandedId === t.id ? '\u25B2' : '\u25BC'}</span>
                            </div>
                            {expandedId === t.id && (
                                <div className="px-4 pb-4 bg-gray-100/50 dark:bg-gray-800/50 border-t border-gray-300 dark:border-gray-700">
                                    <div className="pt-3 text-sm">
                                        <DetailField label="Token" value={t.token} mono />
                                        <DetailField label="Created" value={formatDate(t.createdAt)} />
                                        <DetailField label="Expires" value={formatDate(t.expiresAt)} />
                                        <DetailField label="Subject Restriction" value={t.subjectRestriction} />
                                        <DetailField label="SAN Restriction" value={t.sanRestriction} />
                                        <DetailField label="Protocol" value={t.protocol} />
                                    </div>
                                    {!t.isRevoked && (
                                        <button onClick={() => handleRevoke(t.id)} className="mt-3 px-3 py-1 bg-red-700 text-gray-900 dark:text-white text-xs rounded hover:bg-red-600">
                                            Revoke Token
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default EnrollmentManagement;
