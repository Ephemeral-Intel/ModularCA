import type { ApiEndpoint } from '../types';
import { authentication } from './authentication';
import { totpMfa } from './totp-mfa';
import { webauthnMfa } from './webauthn-mfa';
import { mtls } from './mtls';
import { stepUp } from './step-up';

export const auth: ApiEndpoint[] = [
    ...authentication,
    ...totpMfa,
    ...webauthnMfa,
    ...mtls,
    ...stepUp,
];
