# Source provenance

This private Aplyd mirror starts from the exact source tree of
[croffasia/itsaplan commit 3ccdc104af8b91bc4d89aebd477802f99c01645e](https://github.com/croffasia/itsaplan/commit/3ccdc104af8b91bc4d89aebd477802f99c01645e).
The original licence, notices and source-offer implementation are retained.
The import records the upstream revision rather than copying unreviewed historical objects.

Original release, publishing, scheduled scan and contributor automation files are
retained under `.github/upstream-workflows/` for provenance; they are inactive.
Only the reviewed source CI workflow runs in this mirror. No deployment is configured.

Native logout changes default off, do not infer identities, change database schemas,
reset credentials or alter native role/permission grants. Native-session checks use
the original session birth time; independent machine credentials retain native policy.
Rollback must preserve the Accounts revocation ledger and enforcing native guards.
