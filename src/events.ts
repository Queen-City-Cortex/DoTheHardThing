// The anonymous event names, shared by the app (analytics.ts) and the Worker (worker/index.ts), so the two cannot drift.
export const EVENTS = ['started', 'finished', 'opened_history'] as const;
export type AppEvent = (typeof EVENTS)[number];
