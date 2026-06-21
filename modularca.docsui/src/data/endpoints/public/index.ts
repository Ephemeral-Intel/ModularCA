import type { ApiEndpoint } from '../types';
import { publicCore } from './public-core';
import { publicSsh } from './ssh';
import { publicEnrollment } from './enrollment';
import { publicShortUrls } from './short-urls';

export const publicApi: ApiEndpoint[] = [
    ...publicCore,
    ...publicSsh,
    ...publicEnrollment,
    ...publicShortUrls,
];
