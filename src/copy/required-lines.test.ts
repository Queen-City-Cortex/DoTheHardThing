import { describe, expect, it } from 'vitest';
import { REQUIRED, t } from '../copy';
import { SCREENS } from './screens.testlib';

describe('required lines are on their screens', () => {
  it.each(Object.entries(REQUIRED).flatMap(([s, ids]) => ids.map((id) => [s, id] as const)))('%s shows %s', (s, id) => {
    expect(SCREENS[s as keyof typeof REQUIRED], `${s} must render t('${id}'): "${t(id)}"`).toContain(t(id));
  });
  it.each(Object.entries(REQUIRED))('%s lists sentences only', (_s, ids) => {
    for (const id of ids) {
      const sentence = /[.?!]$/.test(t(id)) || t(id).split(/\s+/).filter((w) => /\w/.test(w)).length >= 4;
      expect(sentence, `${id} ("${t(id)}") is too short to prove anything; REQUIRED holds sentences only`).toBe(true);
    }
  });
});
