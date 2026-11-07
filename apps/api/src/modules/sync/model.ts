import { t } from 'elysia';

export const revQuery = t.Object({
  scopes: t.String({
    description:
      "Comma-separated scopes to read, each '<kind>:<id>' — access, board, documents, issue, initiative, or inbox (access/board/documents/inbox use project ids).",
  }),
});

export const RevResponse = t.Object({ revs: t.Record(t.String(), t.String()) });
