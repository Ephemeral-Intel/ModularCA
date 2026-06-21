import type { ApiEndpoint } from '../../types';
import { adminCa } from './ca';
import { adminCertificates } from './certificates';
import { adminIssuance } from './issuance';
import { adminRevocation } from './revocation';
import { adminCsr } from './csr';
import { adminKeyCeremonies } from './key-ceremonies';

export const adminCaAndCerts: ApiEndpoint[] = [
    ...adminCa,
    ...adminCertificates,
    ...adminIssuance,
    ...adminRevocation,
    ...adminCsr,
    ...adminKeyCeremonies,
];
