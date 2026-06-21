import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import EndpointCard from '../components/EndpointCard';
import type { Endpoint } from '../components/EndpointCard';

let importedEndpoints: Endpoint[] = [];
try {
    const mod = await import('../data/endpoints');
    importedEndpoints = mod.endpoints ?? mod.default ?? [];
} catch {
    // Data file not yet created; use empty array
}

export default function ApiCategoryPage() {
    const { category } = useParams<{ category: string }>();

    const decodedCategory = category ? decodeURIComponent(category) : '';

    const endpoints: Endpoint[] = importedEndpoints;

    const normalizedCategory = decodedCategory.replace(/-/g, ' ').toLowerCase();

    const filtered = useMemo(
        () => endpoints.filter((ep) => ep.category.toLowerCase() === normalizedCategory),
        [endpoints, normalizedCategory],
    );

    return (
        <div className="max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
                <Link
                    to="/docs/api"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                    API Reference
                </Link>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-gray-900 dark:text-white font-medium">
                    {decodedCategory || 'Category'}
                </span>
            </nav>

            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {decodedCategory || 'Category'}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                    {filtered.length} endpoint{filtered.length !== 1 ? 's' : ''} in this category.
                </p>
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                        No endpoints found for category "{decodedCategory}".
                    </p>
                    <Link
                        to="/docs/api"
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                    >
                        Back to API Reference
                    </Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((ep, idx) => (
                        <EndpointCard key={`${ep.method}-${ep.path}-${idx}`} endpoint={ep} />
                    ))}
                </div>
            )}
        </div>
    );
}
