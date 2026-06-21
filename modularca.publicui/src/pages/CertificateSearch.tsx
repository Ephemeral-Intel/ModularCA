import React, { useState } from 'react';
import { apiGet } from '../api/client';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const CertificateSearch: React.FC = () => {
    const [searchType, setSearchType] = useState<'serial' | 'cn'>('serial');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        setSearched(true);
        try {
            if (searchType === 'serial') {
                // Look up a specific certificate by serial number
                const data = await apiGet<any>(`/api/v1/public/ca/${encodeURIComponent(query)}`);
                setResults(data ? [data] : []);
            } else {
                // CN search — fetch all CAs and filter client-side (no public search endpoint)
                const data = await apiGet<any[]>('/api/v1/public/ca');
                const cas = Array.isArray(data) ? data : [];
                const q = query.toLowerCase();
                setResults(cas.filter((c: any) => (c.name || c.subjectDN || '').toLowerCase().includes(q)));
            }
        } catch (err: any) {
            setError(err.message);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Certificate Search</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Look up certificates issued by this CA.</p>
            </div>

            {/* Search form */}
            <form onSubmit={handleSearch} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-5">
                <div className="flex gap-3 items-end">
                    <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Search by</label>
                        <select
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value as 'serial' | 'cn')}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="serial">Serial Number</option>
                            <option value="cn">Subject CN</option>
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            {searchType === 'serial' ? 'Serial Number' : 'Common Name'}
                        </label>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={searchType === 'serial' ? 'e.g. 01A2B3C4...' : 'e.g. example.com'}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !query.trim()}
                        className="px-5 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </div>
            </form>

            {error && <p className="text-sm text-red-800 dark:text-red-400">{error}</p>}

            {/* Results */}
            {searched && !loading && (
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                        {results.length} result{results.length !== 1 ? 's' : ''} found
                    </h2>
                    {results.map((cert) => {
                        const serial = cert.serialNumber || cert.serial;
                        const isExpanded = expanded === serial;
                        return (
                            <div key={serial} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setExpanded(isExpanded ? null : serial)}
                                    className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{cert.subjectDN || cert.subject}</h3>
                                        <p className="text-xs text-gray-600 mt-1 font-mono">{serial}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {cert.revoked && (
                                            <span className="px-2 py-0.5 text-[10px] bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded">Revoked</span>
                                        )}
                                        {!cert.revoked && (
                                            <span className="px-2 py-0.5 text-[10px] bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700 rounded">Valid</span>
                                        )}
                                        <span className="text-gray-600 text-xs">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                                    </div>
                                </button>
                                {isExpanded && (
                                    <div className="px-5 pb-4 border-t border-gray-300 dark:border-gray-700 pt-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                            <div><span className="text-gray-600">Subject:</span> <span className="text-gray-700 dark:text-gray-300">{cert.subjectDN || cert.subject}</span></div>
                                            <div><span className="text-gray-600">Issuer:</span> <span className="text-gray-700 dark:text-gray-300">{cert.issuerDN || cert.issuer}</span></div>
                                            <div><span className="text-gray-600">Serial:</span> <span className="text-gray-700 dark:text-gray-300 font-mono">{serial}</span></div>
                                            <div><span className="text-gray-600">Not Before:</span> <span className="text-gray-700 dark:text-gray-300">{formatDate(cert.notBefore)}</span></div>
                                            <div><span className="text-gray-600">Not After:</span> <span className="text-gray-700 dark:text-gray-300">{formatDate(cert.notAfter)}</span></div>
                                            <div><span className="text-gray-600">Algorithm:</span> <span className="text-gray-700 dark:text-gray-300">{cert.keyAlgorithm || cert.signatureAlgorithm || '-'}</span></div>
                                            <div><span className="text-gray-600">Revoked:</span> <span className={cert.revoked ? 'text-red-800 dark:text-red-400' : 'text-green-800 dark:text-green-400'}>{cert.revoked ? 'Yes' : 'No'}</span></div>
                                            {cert.revocationReason && (
                                                <div><span className="text-gray-600">Reason:</span> <span className="text-red-800 dark:text-red-400">{cert.revocationReason}</span></div>
                                            )}
                                        </div>
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

export default CertificateSearch;
