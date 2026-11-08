import type { Column } from '@/lib/api/endpoints/columns';
import type { BoardIssue, SubtaskDisposition } from '@/lib/api/endpoints/issues';

// A subtask choice the API can act on: 'reassign' also needs the issue to move to.
// The delete and archive confirmations stay disabled until it is.
export function dispositionReady(disposition: SubtaskDisposition | null): boolean {
  if (!disposition) return false;
  return disposition.subtasks !== 'reassign' || disposition.newParentId != null;
}

// The issues a layout renders rows of its own for: a subtask is dropped, since it
// is rendered under its parent instead. One whose parent is not in the set keeps
// its own row — the parent is archived or filtered out, so there is nothing to
// render it under and it would otherwise disappear.
export function withoutShownSubtasks<T extends { id: number; parentId: number | null }>(
  issues: T[],
  allIssues: T[] = issues,
): T[] {
  const shown = new Set(issues.map((issue) => issue.id));
  const byId = new Map(allIssues.map((issue) => [issue.id, issue]));
  return issues.filter((issue) => {
    let parentId = issue.parentId;
    const visited = new Set([issue.id]);
    while (parentId !== null && !visited.has(parentId)) {
      if (shown.has(parentId)) return false;
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

// How many subtasks the given issues have, read off the board payload. The delete
// and archive confirmations ask what happens to them whenever this is not zero —
// the API rejects a removal that does not say.
export function subtaskCount(issues: BoardIssue[], parentIds: number[]): number {
  const wanted = new Set(parentIds);
  return issues.reduce(
    (total, issue) => (wanted.has(issue.id) ? total + issue.subtaskCount : total),
    0,
  );
}

// How far an issue's subtasks have got: the ones in a completed column against
// how many there are. Canceled subtasks count towards neither — they were dropped,
// not finished, and counting them as done would read as progress.
export function subtaskProgress(
  subtasks: { columnId: number }[],
  columnById: Map<number, Column>,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const subtask of subtasks) {
    const stateType = columnById.get(subtask.columnId)?.stateType;
    if (stateType === 'canceled') continue;
    total++;
    if (stateType === 'completed') done++;
  }
  return { done, total };
}

export function flattenDescendants<T extends { id: number }>(
  issueId: number,
  byParent: Map<number, T[]>,
): (T & { nestingDepth: number })[] {
  const result: (T & { nestingDepth: number })[] = [];
  const visited = new Set([issueId]);
  const stack = (byParent.get(issueId) ?? []).map((issue) => ({ issue, depth: 1 })).reverse();
  while (stack.length) {
    const { issue, depth } = stack.pop()!;
    if (visited.has(issue.id)) continue;
    visited.add(issue.id);
    result.push({ ...issue, nestingDepth: depth });
    for (const child of [...(byParent.get(issue.id) ?? [])].reverse()) {
      stack.push({ issue: child, depth: depth + 1 });
    }
  }
  return result;
}
