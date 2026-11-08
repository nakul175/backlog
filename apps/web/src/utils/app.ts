import { runtimeEnv } from './runtimeEnv';

export const APP_NAME = 'Backlog';
export const APP_BRAND = 'Backlog by aplyd';

// The page about the other editions, linked wherever the app names what they add.
export const PRO_URL = 'https://itsaplan.dev/pro';

// The legal document URLs, linked from the logged-out screens: Google requires the
// privacy policy and terms registered for the OAuth client to be reachable before
// consent is given. Each instance points these at its own documents through its
// environment (see runtimeEnv); when unset, the legal notice is hidden.
export const PRIVACY_POLICY_URL = runtimeEnv().privacyUrl;
export const TERMS_URL = runtimeEnv().termsUrl;
