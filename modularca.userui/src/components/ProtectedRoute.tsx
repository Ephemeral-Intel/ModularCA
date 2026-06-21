// ProtectedRoute.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated, isMfaSetupRequired } from './auth';

type Props = {
    children: React.ReactNode;
};

const ProtectedRoute: React.FC<Props> = ({ children }) => {
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }
    if (isMfaSetupRequired()) {
        return <Navigate to="/mfa-setup" replace />;
    }
    return <>{children}</>;
};

export default ProtectedRoute;
