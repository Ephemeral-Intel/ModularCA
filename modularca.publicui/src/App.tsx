import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import CaCertificates from './pages/CaCertificates';
import CrlDownload from './pages/CrlDownload';
import CertificateSearch from './pages/CertificateSearch';
import AcmeDirectory from './pages/AcmeDirectory';
import NotFound from './pages/NotFound';
import ScrollToTop from './components/ScrollToTop';

function App() {
    return (
        <ErrorBoundary>
            <ThemeProvider>
                <ToastProvider>
                    <BrowserRouter basename="/public">
                        <ScrollToTop />
                        <Routes>
                            <Route element={<Layout />}>
                                <Route path="/" element={<Landing />} />
                                <Route path="/certificates" element={<CaCertificates />} />
                                <Route path="/crl" element={<CrlDownload />} />
                                <Route path="/search" element={<CertificateSearch />} />
                                <Route path="/acme" element={<AcmeDirectory />} />
                                <Route path="*" element={<NotFound />} />
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </ToastProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}

export default App;
