import type { ApiEndpoint } from './types';
import { auth } from './auth';
import { setup } from './setup';
import { user } from './user';
import { admin } from './admin';
import { publicApi } from './public';
import { protocols } from './protocols';
import { integration } from './integration';

export type { ApiEndpoint, EndpointField, HeaderField } from './types';

export const endpoints: ApiEndpoint[] = [
    ...auth,
    ...setup,
    ...user,
    ...admin,
    ...publicApi,
    ...protocols,
    ...integration,
];
