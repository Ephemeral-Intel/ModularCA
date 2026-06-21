// ProtectedRoute.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated, isMfaSetupRequired } from './auth';
import { useAuth } from '../context/AuthContext';

type Props = {
    children: React.ReactNode;
    /**
     * List of role levels (e.g. ['Admin','Operator']) the user
     * must hold to render the children. SystemAdmin satisfies any role. Empty/missing
     * means "any authenticated user". Failing the check renders an inline 403 panel
     * instead of redirecting to login.
     */
    requiredRoles?: string[];
    /**
     * Optional scope string (e.g. 'system:Admin' or 'Admin' for any-CA admin).
     */
    requiredScope?: string;
};

const ForbiddenPanel: React.FC<{ message?: string }> = ({ message }) => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {message || 'You do not have permission to view this page. Contact a system administrator if you believe this is an error.'}
            </p>
            <a
                href="/admin/dashboard"
                className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
                Return to Dashboard
            </a>
        </div>
    </div>
);

const ProtectedRoute: React.FC<Props> = ({ children, requiredRoles, requiredScope }) => {
    const { user, loading, hasAnyRole, hasScope } = useAuth();

    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }
    if (isMfaSetupRequired()) {
        return <Navigate to="/mfa-setup" replace />;
    }

    // Role/scope gating only applies if requested. Wait for the AuthContext to
    // hydrate before deciding so we don't flash a 403 during initial load.
    if ((requiredRoles && requiredRoles.length > 0) || requiredScope) {
        if (loading || !user) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Loading…</div>
                </div>
            );
        }
        if (requiredRoles && requiredRoles.length > 0 && !hasAnyRole(requiredRoles)) {
            return <ForbiddenPanel message={`This page requires one of: ${requiredRoles.join(', ')}.`} />;
        }
        if (requiredScope && !hasScope(requiredScope)) {
            return <ForbiddenPanel message={`This page requires the ${requiredScope} scope.`} />;
        }
    }

    return <>{children}</>;
};

export default ProtectedRoute;
