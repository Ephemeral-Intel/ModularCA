import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { StepUpMfaProvider } from './components/StepUpMfaContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ScrollToTop from './components/ScrollToTop';

// Auth pages — eagerly loaded (entry points, must render immediately)
import Login from './pages/Login';
import LoginBannerPage from './pages/LoginBanner';
import MfaSetup from './pages/MfaSetup';
import MfaVerify from './pages/MfaVerify';
import MfaCallback from './pages/MfaCallback';

// All other pages — lazily loaded per route
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const RequestCertificate = React.lazy(() => import('./pages/RequestCertificate'));
const MyCertificates = React.lazy(() => import('./pages/MyCertificates'));
const CertificateRequests = React.lazy(() => import('./pages/CertificateRequests'));
const MySshCertificates = React.lazy(() => import('./pages/MySshCertificates'));
const CaInformation = React.lazy(() => import('./pages/CaInformation'));
const MySecurity = React.lazy(() => import('./pages/MySecurity'));
const NotFound = React.lazy(() => import('./pages/NotFound'));

const PageLoader = () => (
    <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
);

const App = () => (
    <ThemeProvider>
    <ToastProvider>
    <Router basename="/user">
        <ScrollToTop />
        <Routes>
            <Route path="/banner" element={<LoginBannerPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/mfa-setup" element={<MfaSetup />} />
            <Route path="/mfa-verify" element={<MfaVerify />} />
            <Route path="/mfa-callback" element={<MfaCallback />} />
            <Route path="/*" element={
                <ProtectedRoute>
                    <StepUpMfaProvider>
                        <Layout>
                            <Suspense fallback={<PageLoader />}>
                                <Routes>
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/dashboard" element={<Dashboard />} />
                                    <Route path="/request" element={<RequestCertificate />} />
                                    <Route path="/certificates" element={<MyCertificates />} />
                                    <Route path="/requests" element={<CertificateRequests />} />
                                    <Route path="/ssh" element={<MySshCertificates />} />
                                    <Route path="/authorities" element={<CaInformation />} />
                                    <Route path="/security" element={<MySecurity />} />

                                    {/* Catch-all 404 — must come last. Renders inside the
                                        authenticated user Layout so the user keeps the navigation
                                        shell while seeing the page-not-found message. */}
                                    <Route path="*" element={<NotFound />} />
                                </Routes>
                            </Suspense>
                        </Layout>
                    </StepUpMfaProvider>
                </ProtectedRoute>
            } />
        </Routes>
    </Router>
    </ToastProvider>
    </ThemeProvider>
);

export default App;
