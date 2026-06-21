import React, { useState, useEffect } from 'react';
import { apiGet } from '../api/client';

interface CaInfo {
    id: string;
    name: string;
    label: string;
    isDefault: boolean;
}

interface PublicInfo {
    publicDomain: string;
    publicHttpsBaseUrl: string;
}

const AcmeDirectory: React.FC = () => {
    const [cas, setCas] = useState<CaInfo[]>([]);
    const [selectedLabel, setSelectedLabel] = useState<string>('');
    const [directory, setDirectory] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Canonical public base URL from the server (built from Https.PublicDomain),
    // not window.location.origin — a reverse proxy may present a different host
    // than the one operators configured for external clients to use.
    const [baseUrl, setBaseUrl] = useState<string>(window.location.origin);

    // Load available CAs and the canonical public info in parallel
    useEffect(() => {
        apiGet<PublicInfo>('/api/v1/public/info')
            .then((info) => {
                if (info?.publicHttpsBaseUrl) setBaseUrl(info.publicHttpsBaseUrl);
            })
            .catch(() => {
                // Fall back to window.location.origin (already set) — don't
                // block the page on this.
            });

        apiGet<any[]>('/api/v1/public/ca')
            .then((data) => {
                const caList = (data || []).map((ca: any) => ({
                    id: ca.id,
                    name: ca.name || ca.subjectDN,
                    label: ca.label || 'default',
                    isDefault: ca.isDefault,
                }));
                setCas(caList);
                const defaultCa = caList.find(c => c.isDefault) || caList[0];
                if (defaultCa) setSelectedLabel(defaultCa.label);
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    // Load ACME directory when a CA is selected
    useEffect(() => {
        if (!selectedLabel) return;
        setLoading(true);
        setError(null);
        apiGet<any>(`/acme/${selectedLabel}/directory`)
            .then(setDirectory)
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [selectedLabel]);

    const directoryUrl = selectedLabel ? `${baseUrl}/acme/${selectedLabel}/directory` : '';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ACME Directory</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Use the ACME protocol to automatically obtain and renew TLS certificates.
                </p>
            </div>

            {/* CA Selector */}
            {cas.length > 1 && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-5">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Certificate Authority</h2>
                    <select
                        value={selectedLabel}
                        onChange={(e) => setSelectedLabel(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                        {cas.map((ca) => (
                            <option key={ca.label} value={ca.label}>
                                {ca.name} {ca.isDefault ? '(default)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Directory URL */}
            {directoryUrl && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-5">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Directory URL</h2>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded px-4 py-3 font-mono text-sm text-blue-800 dark:text-blue-400 select-all">
                        {directoryUrl}
                    </div>
                </div>
            )}

            {/* Directory endpoints */}
            {loading && <p className="text-sm text-gray-600 dark:text-gray-400">Loading directory...</p>}
            {error && <p className="text-sm text-red-800 dark:text-red-400">{error}</p>}

            {directory && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-5">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Endpoints</h2>
                    <div className="space-y-2">
                        {Object.entries(directory).filter(([k]) => k !== 'meta').map(([key, url]) => (
                            <div key={key} className="flex items-center justify-between py-1 border-b border-gray-300 dark:border-gray-700/50 last:border-b-0">
                                <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">{key}</span>
                                <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">{String(url)}</span>
                            </div>
                        ))}
                    </div>
                    {directory.meta && (
                        <div className="mt-4 pt-3 border-t border-gray-300 dark:border-gray-700">
                            <h3 className="text-xs font-semibold text-gray-600 mb-2">Metadata</h3>
                            <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto">
                                {JSON.stringify(directory.meta, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* Client examples */}
            {directoryUrl && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Client Configuration</h2>

                    <div>
                        <h3 className="text-xs font-semibold text-blue-800 dark:text-blue-400 mb-1">certbot</h3>
                        <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto">
{`certbot certonly \\
  --server ${directoryUrl} \\
  --standalone \\
  -d example.com`}
                        </pre>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold text-blue-800 dark:text-blue-400 mb-1">acme.sh</h3>
                        <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto">
{`acme.sh --issue \\
  --server ${directoryUrl} \\
  --standalone \\
  -d example.com`}
                        </pre>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold text-blue-800 dark:text-blue-400 mb-1">win-acme</h3>
                        <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto">
{`wacs.exe --baseuri ${directoryUrl}`}
                        </pre>
                    </div>

                    <div className="text-xs text-gray-600 pt-2 border-t border-gray-300 dark:border-gray-700">
                        If this CA uses a self-signed root certificate, you may need to add the
                        <code className="mx-1 px-1 bg-gray-50 dark:bg-gray-900 rounded">--no-verify-ssl</code> flag
                        or install the CA certificate in your trust store first.
                    </div>
                </div>
            )}
        </div>
    );
};

export default AcmeDirectory;
