export interface EndpointField {
    name: string;
    type: string;
    required: boolean;
    description: string;
}

export interface HeaderField {
    name: string;
    type: string;
    required: boolean;
    description: string;
}

export interface ApiEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    summary: string;
    auth: string;
    category: string;
    requestBody?: EndpointField[];
    queryParams?: EndpointField[];
    headers?: HeaderField[];
    responseDescription?: string;
    notes?: string;
}
