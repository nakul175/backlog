# Portal-created BTF accounts

The Portal creates a native human account with the immutable `portal_btf_<request UUID>` ID, an exact existing Accounts subject, a team Member membership and a reviewed project Reader role. It creates no password, personal workspace, owner role or captured-account binding.

These IDs always require a current Accounts proof, including while legacy native-session enforcement is off. Accounts also requires an applied Portal creation receipt, active person/organisation/app access and the exact reviewed project mapping. Unconfirmed cross-store creation cannot sign in. Existing native IDs retain the existing enforcement setting.

Use the central OIDC configuration from `docs/exact-central-oidc.md` (where present) and pin `APLYD_ACCOUNTS_CLIENT_ID` to `backlog` or `backlog-staging`. `APLYD_NATIVE_LOGOUT_LOOPBACK_TEST=true` permits a literal loopback issuer only outside production for isolated acceptance. It is not a production setting.

Native project permissions are read for each API request. Portal-created account revocation removes that account's single reviewed project membership, disables the native account and deletes only its native sessions. Other memberships or instance/team/workspace authority cause refusal and require separate review.
