import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client';

/// <summary>
/// Pre-login banner gate. Fetches the configured banner title + body from
/// /auth/login-banner. If nothing is configured, redirects straight to the
/// login page. Otherwise renders the acknowledgment screen; Accept sets a
/// session-scoped flag and forwards to /login, Decline clears any stale flag
/// and shows a terminal message. The flag is kept in sessionStorage so it
/// resets when the browser tab closes, matching AC-8's "each access attempt"
/// expectation.
/// </summary>
const LoginBanner: React.FC = () => {
    const navigate = useNavigate();
    const [title, setTitle] = useState<string>('System Use Notification');
    const [body, setBody] = useState<string | null>(null);
    const [declined, setDeclined] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiGet<{ banner: string | null; title: string | null }>('/auth/login-banner')
            .then(d => {
                if (!d.banner) {
                    // No banner configured — nothing to acknowledge; go straight to login.
                    navigate('/login', { replace: true });
                    return;
                }
                setBody(d.banner);
                if (d.title) setTitle(d.title);
            })
            .catch(() => {
                // Endpoint unreachable or server error — don't strand the user; fall through to login.
                navigate('/login', { replace: true });
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const accept = () => {
        sessionStorage.setItem('loginBannerAcknowledged', '1');
        navigate('/login', { replace: true });
    };

    const decline = () => {
        sessionStorage.removeItem('loginBannerAcknowledged');
        setDeclined(true);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (declined) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 px-4">
                <div className="bg-gray-100 dark:bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-lg border border-gray-300 dark:border-gray-700 text-center space-y-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Access Denied</h2>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        You have declined the system use notification. Close this browser tab to terminate the session.
                    </p>
                    <button
                        onClick={() => { setDeclined(false); }}
                        className="text-xs text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 underline"
                    >
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900 px-4">
            <div className="bg-gray-100 dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-2xl border border-gray-300 dark:border-gray-700 space-y-5">
                <h2 className="text-2xl font-semibold text-center text-gray-900 dark:text-white">{title}</h2>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 text-sm p-4 rounded whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
                    {body}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
                    <button
                        onClick={decline}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded transition-colors"
                    >
                        Decline
                    </button>
                    <button
                        onClick={accept}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                    >
                        I Acknowledge &amp; Accept
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginBanner;
