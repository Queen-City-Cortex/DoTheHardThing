import * as L from '../logic';

export const it_ = (text: string, tag: L.Tag | L.Tag[], s: boolean | null = null, l: boolean | null = null, pushedCount = 0): L.Item => ({ id: text, text, tags: [tag].flat(), satisfied: s, leverage: l, pushedCount });
export const day = (date: string, items: L.Item[], extra: Partial<L.Day> = {}): L.Day => ({ date, openedAt: 0, items, chosenId: null, block: null, gotBlock: null, didIt: null, doneText: null, closed: false, ...extra });
export const MIN = 60_000;