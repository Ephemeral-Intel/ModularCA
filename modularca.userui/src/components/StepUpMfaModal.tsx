import React, { useState } from 'react';
import { API_BASE } from '../api/client';

/// <summary>
/// Modal component for step-up MFA verification on destructive operations.
/// Displays a TOTP code input and verifies against the step-up endpoint.
/// </summary>
interface StepUpMfaModalProps {
    isOpen: boolean;
    operation: string;
    targetId?: string;
    onSuccess: (mfaToken: string) => void;
    onCancel: () => void;
}

const StepUpMfaModal: React.FC<StepUpMfaModalProps> = ({ isOpen, operation, targetId, onSuccess, onCancel }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) return;

        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('authToken');
            const csrfMatch = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]*)/);
            const csrfHeaders: Record<string, string> = {};
            if (csrfMatch) csrfHeaders['X-CSRF-Token'] = decodeURIComponent(csrfMatch[1]);

            const resp = await fetch(`${API_BASE}/auth/mfa/verify-stepup/totp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...csrfHeaders,
                },
                body: JSON.stringify({ code, operation, targetId }),
            });

            if (!resp.ok) {
                const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
                throw new Error(body.error || body.message || 'Verification failed');
            }

            const data = await resp.json();
            setCode('');
            onSuccess(data.mfaToken || data.token);
        } catch (err: any) {
            setError(err.message || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        setCode('');
        setError(null);
        onCancel();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/25 dark:bg-black/60 backdrop-blur-sm"
                onClick={handleCancel}
            />

            {/* Modal */}
            <div className="relative bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
                <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Step-Up Verification Required
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        This operation requires additional authentication.
                        Enter the 6-digit code from your authenticator app.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/50 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 text-sm text-center p-2 rounded">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white rounded px-3 py-3 focus:border-blue-500 focus:outline-none text-center text-2xl tracking-widest"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="flex-1 py-2 text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="flex-1 py-2 text-sm font-medium bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {loading ? 'Verifying...' : 'Verify'}
                        </button>
                    </div>
                </form>

                <p className="text-xs text-gray-600 text-center">
                    Operation: <span className="font-mono text-gray-600 dark:text-gray-400">{operation}</span>
                    {targetId && (
                        <>
                            {' '} | Target: <span className="font-mono text-gray-600 dark:text-gray-400">{targetId}</span>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
};

export default StepUpMfaModal;
