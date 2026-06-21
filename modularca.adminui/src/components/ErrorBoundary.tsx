import React from 'react';

interface ErrorBoundaryState {
    hasError: boolean;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

/**
 * Top-level React error boundary. Catches uncaught exceptions
 * raised during render so a single bad backend response cannot blank the entire
 * SPA. The shown message is intentionally generic — raw error.message strings
 * may include backend type names or paths from ASP.NET ProblemDetails.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
        // Intentionally do not store the raw error message — see header comment.
        return { hasError: true };
    }

    componentDidCatch(_error: Error, _info: React.ErrorInfo): void {
        // Logging to a backend endpoint is intentionally omitted (no
        // /api/v1/admin/client-errors endpoint exists yet). The error is
        // already in the browser console via React's own logger.
    }

    handleReload = () => {
        // Reset state and force a full reload so any stale module state
        // (timers, websockets, contexts) is rebuilt cleanly.
        this.setState({ hasError: false });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
                    <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong</h1>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            The page encountered an unexpected error. Reload to recover.
                            If the problem persists, contact your administrator.
                        </p>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                            Reload
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
