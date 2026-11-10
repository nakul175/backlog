# Central entry during native-login transition

With `APLYD_APEX_LOGIN_ONLY` unset or false, `/login` retains the instance’s existing native sign-in methods. The Portal app URL can use `/login?central=1` to start the existing OIDC flow directly. Only the exact scalar value `1` selects central entry; it does not grant app access or bypass the configured OIDC provider, state, PKCE or native session checks.

When `APLYD_APEX_LOGIN_ONLY=true`, every login entry continues to use central sign-in. A query parameter cannot restore native login under this policy. Do not enable this global flag while unlinked users still need their existing native login.

An OIDC failure shows the existing bounded retry UI. Passwords, user links, roles and data are unchanged by this presentation route. Production deployment requires the combined release checks; this document does not enable any setting.
