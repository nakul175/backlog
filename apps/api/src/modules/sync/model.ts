import { t } from 'elysia';

export const revQuery = t.Object({
  scopes: t.String({
    description:
      "Comma-separated scopes to read, each '<kind>:<id>' — access, board, documents, issue, initiative, inbox, or workspaces (workspaces uses 1 for the current person; access/board/documents/inbox use project ids).",
  }),
});

export const RevResponse = t.Object({ revs: t.Record(t.String(), t.String()) });
