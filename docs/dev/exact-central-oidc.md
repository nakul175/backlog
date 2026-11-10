# Exact central OIDC admission (staging candidate)

Before adding Portal account provisioning, BTF must distinguish an existing exact
central subject from an address collision. The instance's generic OIDC defaults
allow email-based account linking. This optional gate rejects absent or ambiguous
subject links instead; it never creates an account, password, grant or binding.

Default is OFF. In a reviewed isolated stack, set `APLYD_CENTRAL_OIDC_ENABLED=true`,
`APLYD_ACCOUNTS_ISSUER` and `APLYD_ACCOUNTS_CLIENT_ID`. The existing encrypted native
OIDC configuration must use that exact issuer's discovery URL and client ID,
PKCE, and the `openid` plus `aplyd` scopes (the latter supplies the central session UID).
No client secret is added to source. Plain HTTP is accepted only on loopback and
outside production. Production issuer/configuration changes are not part of this PR.

The provider must expose verified ID-token metadata with the pinned issuer. The
library verifies signature, nonce and audience before our gate accepts the signed
subject and central session UID. An existing unique `account(provider_id='oidc',
account_id=sub)` must resolve to an active human. Agents and duplicate subjects
fail closed. Accounts must confirm that exact native ID is assigned to this current
central session. Native user/account revisions and configuration are checked again
after that call. No email lookup is used. Unavailability refuses this sign-in.

This gate covers OIDC admission. Existing session permission refresh/revocation is
handled by the separately tested native guards. It does not claim atomic exclusion
of every administrative identity edit after the final check. Fresh account creation,
uncertain creation-receipt fencing, and a Portal Save → first-login browser matrix
remain required before enabling a provisioning writer. Existing password login,
generic OIDC when this gate is OFF, users, roles, sessions and business data are
unchanged.

Validation: signed-token/nonce/authority HTTP tests on ephemeral loopback; real
PostgreSQL identity lookup tests in a disposable database; lint/typecheck. The
PostgreSQL test refuses any database name outside `btf_exact_oidc_test_<hex>`.
The browser permission evidence for the parent hierarchy candidate is independent
of this prerequisite; it is not a fresh-account browser acceptance claim.
