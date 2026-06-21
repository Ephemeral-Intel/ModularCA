import type { ApiEndpoint } from '../../types';
import { adminSigningProfiles } from './signing-profiles';
import { adminCertProfiles } from './cert-profiles';
import { adminRequestProfiles } from './request-profiles';
import { adminTemplates } from './templates';
import { adminSshProfiles } from './ssh-profiles';
import { adminSshTemplates } from './ssh-templates';

export const adminProfiles: ApiEndpoint[] = [
    ...adminSigningProfiles,
    ...adminCertProfiles,
    ...adminRequestProfiles,
    ...adminTemplates,
    ...adminSshProfiles,
    ...adminSshTemplates,
];
