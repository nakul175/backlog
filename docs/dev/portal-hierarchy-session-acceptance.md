# Portal hierarchy changes in open sessions

The members page remounts its content when the current project, viewer authority or permission matrix changes. Open add-member, invitation and member-management dialogs lose their transient selection state. A later regrant presents a closed editor.

The existing shared access revision poll reads native workspace/team/project authority and refreshes the shell; the API continues to authorize every request. This change adds no native writer, login behavior, role, schema or production flag.

Verification: the original implementation reproduces the open-dialog regression; two component tests cover complete and invitation-only downgrades and regrant. All 403 web tests, lint, typecheck and optimized production build pass. In the isolated browser matrix, Portal Save grants Team Manager in an existing session, its backend allows project administration, and downgrade to Member rejects it and clears the open dialog. Workspace Admin grants read-only inherited project access and revoke clears the already-open inherited project. The original cookie is preserved. Protected native/Portal tables compare unchanged. The native UI candidate runs on Mac loopback against the approved synthetic staging API; only web transport is rerouted, with no mocked API or authorization. No production changes.
