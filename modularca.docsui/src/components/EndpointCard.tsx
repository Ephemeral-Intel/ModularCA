import { useState } from 'react';

export interface EndpointField {
    name: string;
    type: string;
    required?: boolean;
    description: string;
}

export interface EndpointParam {
    name: string;
    type: string;
    description: string;
}

export interface Endpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    summary: string;
    category: string;
    auth?: string;
    requestBody?: EndpointField[];
    queryParams?: EndpointParam[];
    headers?: EndpointParam[];
    responseDescription?: string;
    notes?: string;
}

const methodColors: Record<string, string> = {
    GET: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    POST: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    PUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
    const [expanded, setExpanded] = useState(false);

    const hasDetails =
        (endpoint.requestBody && endpoint.requestBody.length > 0) ||
        (endpoint.queryParams && endpoint.queryParams.length > 0) ||
        (endpoint.headers && endpoint.headers.length > 0) ||
        endpoint.responseDescription ||
        endpoint.notes;

    return (
        <div
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-shadow hover:shadow-md"
        >
            <button
                type="button"
                className="w-full text-left px-4 py-3 flex items-center gap-3 cursor-pointer"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
            >
                <span
                    className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full uppercase tracking-wide min-w-[56px] ${methodColors[endpoint.method] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}
                >
                    {endpoint.method}
                </span>

                <code className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {endpoint.path}
                </code>

                <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400 truncate ml-2">
                    {endpoint.summary}
                </span>

                {endpoint.auth && (
                    <span className="ml-auto mr-2 shrink-0 inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        {endpoint.auth}
                    </span>
                )}

                {hasDetails && (
                    <svg
                        className={`w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>

            {/* Summary visible on small screens below the header */}
            <p className="sm:hidden px-4 pb-2 text-sm text-gray-600 dark:text-gray-400">
                {endpoint.summary}
            </p>

            {expanded && hasDetails && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                    {/* Request Body */}
                    {endpoint.requestBody && endpoint.requestBody.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                Request Body
                            </h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                            <th className="pb-2 pr-4 font-medium">Field</th>
                                            <th className="pb-2 pr-4 font-medium">Type</th>
                                            <th className="pb-2 pr-4 font-medium">Required</th>
                                            <th className="pb-2 font-medium">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {endpoint.requestBody.map((field) => (
                                            <tr
                                                key={field.name}
                                                className="border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                                            >
                                                <td className="py-2 pr-4 font-mono text-gray-900 dark:text-white">
                                                    {field.name}
                                                </td>
                                                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                                                    {field.type}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    {field.required ? (
                                                        <span className="text-red-600 dark:text-red-400 font-medium">Yes</span>
                                                    ) : (
                                                        <span className="text-gray-400 dark:text-gray-500">No</span>
                                                    )}
                                                </td>
                                                <td className="py-2 text-gray-600 dark:text-gray-400">
                                                    {field.description}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Query Parameters */}
                    {endpoint.queryParams && endpoint.queryParams.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                Query Parameters
                            </h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                            <th className="pb-2 pr-4 font-medium">Parameter</th>
                                            <th className="pb-2 pr-4 font-medium">Type</th>
                                            <th className="pb-2 font-medium">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {endpoint.queryParams.map((param) => (
                                            <tr
                                                key={param.name}
                                                className="border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                                            >
                                                <td className="py-2 pr-4 font-mono text-gray-900 dark:text-white">
                                                    {param.name}
                                                </td>
                                                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                                                    {param.type}
                                                </td>
                                                <td className="py-2 text-gray-600 dark:text-gray-400">
                                                    {param.description}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Headers */}
                    {endpoint.headers && endpoint.headers.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                Headers
                            </h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                            <th className="pb-2 pr-4 font-medium">Header</th>
                                            <th className="pb-2 pr-4 font-medium">Type</th>
                                            <th className="pb-2 font-medium">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {endpoint.headers.map((header) => (
                                            <tr
                                                key={header.name}
                                                className="border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                                            >
                                                <td className="py-2 pr-4 font-mono text-gray-900 dark:text-white">
                                                    {header.name}
                                                </td>
                                                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                                                    {header.type}
                                                </td>
                                                <td className="py-2 text-gray-600 dark:text-gray-400">
                                                    {header.description}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Response Description */}
                    {endpoint.responseDescription && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                Response
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {endpoint.responseDescription}
                            </p>
                        </div>
                    )}

                    {/* Notes */}
                    {endpoint.notes && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-md">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                Notes
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {endpoint.notes}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
