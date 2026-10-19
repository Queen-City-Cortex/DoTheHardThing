// Types for scripts/transcript.mjs, so src/copy/talk.test.ts can import it under the app's tsconfig (no Node types there).
export declare const TRANSCRIPT_HINT: string;
export declare function transcriptPath(arg?: string): string | null;
export declare function readTranscript(arg?: string): { path: string; text: string; error?: undefined } | { path: string; error: string; text?: undefined } | null;
