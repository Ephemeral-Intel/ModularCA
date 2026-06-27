import React, { useEffect, useState } from 'react';
import { useAutoFocus } from '../hooks/useAutoFocus';

interface SetupStatus {
    configured: boolean;
    databaseConnected: boolean;
    needsDbConfig: boolean;
    staleDb?: boolean;
}

export interface WelcomeResult {
    /** Whether setup-database.yaml is missing and the operator must configure DB creds. */
    needsDbConfig: boolean;
    /** Whether the DB has stale data from a previous installation. */
    staleDb: boolean;
}

interface WelcomeProps {
    onNext: (result: WelcomeResult) => void;
    setupToken: string;
    onSetupTokenChange: (token: string) => void;
}

const inputClass = "w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500";

/// <summary>
/// Welcome step: logo, server status check, setup token validation.
/// Passes the DB status to App.tsx so it can decide whether to show the Database step.
/// </summary>
const Welcome: React.FC<WelcomeProps> = ({ onNext, setupToken, onSetupTokenChange }) => {
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tokenValidated, setTokenValidated] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);
    const [validatingToken, setValidatingToken] = useState(false);
    const autoFocusToken = useAutoFocus<HTMLInputElement>();

    const setupHeaders = (): Record<string, string> => {
        const csrfToken = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/)?.[1] || '';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': decodeURIComponent(csrfToken),
        };
        if (setupToken) headers['X-Setup-Token'] = setupToken;
        return headers;
    };

    const checkStatus = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/setup/status', { headers: setupHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: SetupStatus = await res.json();
            setStatus(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect');
        } finally {
            setLoading(false);
        }
    };

    const handleValidateToken = async () => {
        setValidatingToken(true);
        setTokenError(null);
        try {
            const res = await fetch('/api/v1/setup/validate-token', {
                headers: { 'X-Setup-Token': setupToken },
            });
            if (res.ok) {
                setTokenValidated(true);
                await checkStatus();
            } else {
                const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                setTokenError(data.error || 'Invalid token');
                setTokenValidated(false);
            }
        } catch (err) {
            setTokenError(err instanceof Error ? err.message : 'Validation failed');
            setTokenValidated(false);
        } finally {
            setValidatingToken(false);
        }
    };

    useEffect(() => { checkStatus(); }, []);

    const canProceed = tokenValidated && status !== null && !status.configured;

    const handleGetStarted = () => {
        onNext({
            needsDbConfig: status?.needsDbConfig ?? true,
            staleDb: status?.staleDb ?? false,
        });
    };

    return (
        <div className="space-y-8">
            {/* Logo + Heading */}
            <div className="text-center space-y-3">
                <div className="flex justify-center">
                    <div className="w-20 h-20 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-white text-3xl font-bold tracking-tight">CA</span>
                    </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Welcome to ModularCA</h1>
                <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg">Set up your certificate authority in a few simple steps</p>
            </div>

            {/* Server Status */}
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-3 text-sm">
                    {loading ? (
                        <>
                            <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-gray-600 dark:text-gray-400">Checking server status...</span>
                        </>
                    ) : error ? (
                        <>
                            <span className="text-red-500 text-lg">&#10007;</span>
                            <span className="text-red-600 dark:text-red-400">{error}</span>
                        </>
                    ) : status?.databaseConnected ? (
                        <>
                            <span className="text-green-500 text-lg">&#10003;</span>
                            <span className="text-green-600 dark:text-green-400">Server ready &mdash; database connected</span>
                        </>
                    ) : status?.needsDbConfig ? (
                        <>
                            <span className="text-amber-500 text-lg">&#9888;</span>
                            <span className="text-amber-600 dark:text-amber-400">Database configuration required</span>
                        </>
                    ) : (
                        <>
                            <span className="text-blue-500 text-lg">&#8226;</span>
                            <span className="text-blue-600 dark:text-blue-400">Server ready</span>
                        </>
                    )}
                </div>
                {status?.configured && (
                    <p className="text-amber-600 dark:text-amber-400 text-sm mt-2">
                        ModularCA is already configured. Use <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">--reset --force</code> to start over.
                    </p>
                )}
            </div>

            {/* Setup Token */}
            {!loading && !status?.configured && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Setup Token</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            Enter the one-time setup token displayed on the server console at startup.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                        <input
                            ref={autoFocusToken}
                            type="text"
                            value={setupToken}
                            onChange={e => { onSetupTokenChange(e.target.value); setTokenValidated(false); setTokenError(null); }}
                            placeholder="Paste setup token from console"
                            disabled={tokenValidated}
                            className={inputClass + (tokenValidated ? ' opacity-60' : '')}
                        />
                        <button
                            onClick={handleValidateToken}
                            disabled={!setupToken.trim() || validatingToken || tokenValidated}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white text-sm font-medium rounded transition-colors disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {validatingToken ? 'Validating...' : tokenValidated ? 'Verified' : 'Verify Token'}
                        </button>
                    </div>
                    {tokenError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{tokenError}</p>
                    )}
                    {tokenValidated && (
                        <p className="text-sm text-green-600 dark:text-green-400">&#10003; Token verified successfully.</p>
                    )}
                </div>
            )}

            {/* Get Started */}
            {!loading && !status?.configured && (
                <div className="text-center">
                    <button
                        onClick={handleGetStarted}
                        disabled={!canProceed}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                        Get Started
                    </button>
                </div>
            )}
        </div>
    );
};

export default Welcome;
