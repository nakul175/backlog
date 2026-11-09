# Portal workspace access

The native API exposes a private Unix socket only when `APLYD_PORTAL_WORKSPACE_ENABLED=1`. Its absolute `APLYD_PORTAL_WORKSPACE_CONFIG` file must belong to the API process user, have mode 0600 and resolve without symlinks. The socket directory must belong to the same user and have mode 0700. The socket is mode 0600 and has no TCP listener.

The JSON configuration contains `reviewers` (exact native user IDs), `workspaces` (numeric IDs), `teams` (team ID strings mapped to workspace IDs), and `socket` (absolute unused path). It contains no credential. Portal uses the same reviewed file and must run as the same operating-system user. Container deployments require an explicitly reviewed shared Unix-socket directory and compatible UID; no volume or public port is added automatically. A stale socket is not automatically deleted: confirm its old process has stopped before removing that exact socket.

The existing OIDC configuration must match the current issuer, discovery URL, client ID and PKCE requirement. Actor and recipient are resolved by exact OIDC subject and native ID. Email does not link identities.

Portal reviews the exact plan before dispatch. Native apply locks and rereads authority, memberships, project grants, pending invitations and runtime limits in its transaction. A changed plan, missing configuration, inactive account, SCIM or agent membership, or conflicting ownership fails closed. Reviews carry no secret values.

## Supported operations

- Add an existing active person to an explicitly allowed team in another workspace. Existing workspaces and accounts remain. This creates a Member membership without granting any project role. Dormant project grants and pending invitations in the selected team require separate review.
- Change a human team Member to Manager or back. The native Manager can manage team resources but cannot rename the team, which is Owner-only.
- Remove a human team Member or Manager through the canonical native service. The native service removes that team's project memberships, pending invitations authored by the person and automatic column assignments; it preserves issues and history. Last-owner safeguards remain. Workspace administrators must use the workspace authority workflow, since removing a team membership cannot remove inherited workspace access.
- Transfer a workspace from its sole current owner to an existing active Admin who already belongs to a team in that workspace and is within the native owned-workspace quota. The former owner remains Admin. Exactly one owner remains. Existing teams, projects and work stay in place.

The existing native sync channel publishes a per-user workspace authority fingerprint. Open workspace menus and team/project queries refresh on the shared polling/focus mechanism, without logging the user out. Every native request independently checks current authority.

Requests have bounded body sizes and a 15-second transport deadline; native statements and lock waits are also bounded. A lost reply can represent an already committed transaction. Portal retains an uncertain receipt and blocks automatic retry until reconciliation. Disabling the connector affects future dispatch and does not revert committed grants or transfer ownership back.

No migration or production activation is included in this branch.
