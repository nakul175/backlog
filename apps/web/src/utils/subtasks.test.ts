import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flattenDescendants, withoutShownSubtasks } from './subtasks';

describe('nested subtasks', () => {
  const issues = [
    { id: 1, parentId: null },
    { id: 2, parentId: 1 },
    { id: 3, parentId: 2 },
    { id: 4, parentId: 3 },
    { id: 5, parentId: 1 },
  ];

  it('shows every descendant in tree order at its actual depth', () => {
    const byParent = new Map([
      [1, [issues[1], issues[4]]],
      [2, [issues[2]]],
      [3, [issues[3]]],
    ]);
    assert.deepEqual(
      flattenDescendants(1, byParent).map(({ id, nestingDepth }) => [id, nestingDepth]),
      [
        [2, 1],
        [3, 2],
        [4, 3],
        [5, 1],
      ],
    );
  });

  it('avoids duplicate rows when a filtered intermediate ancestor is still nested', () => {
    assert.deepEqual(withoutShownSubtasks([issues[0], issues[2], issues[3]], issues), [issues[0]]);
    assert.deepEqual(withoutShownSubtasks([issues[2], issues[3]], issues), [issues[2]]);
  });

  it('terminates safely if an invalid cycle reaches the renderer', () => {
    const byParent = new Map([
      [1, [issues[1]]],
      [2, [issues[0]]],
    ]);
    assert.deepEqual(
      flattenDescendants(1, byParent).map(({ id }) => id),
      [2],
    );
  });
});
