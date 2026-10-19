import { COPY } from '../copy';
import type { CopyEntry } from '../copy';
import type { CopyId } from '../copy';

export const entries = Object.entries(COPY) as [CopyId, CopyEntry][];
export const cited = entries.filter(([, e]) => e.kind !== 'own');