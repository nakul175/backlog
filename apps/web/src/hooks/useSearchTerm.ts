'use client';

import { useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// A shorter term matches most of a list, so the list stays unfiltered until the reader
// has typed enough for the result to mean something.
const MIN_LENGTH = 3;

// The search behind a server-filtered list: `search` is what the input shows, `term` is
// what the query sends once typing has paused and the term narrows anything.
export function useSearchTerm() {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  return { search, setSearch, term: debounced.length >= MIN_LENGTH ? debounced : undefined };
}
