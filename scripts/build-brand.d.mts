export const ROOT: string;
export const COPIES: [string, string][];
export function sha(path: string): string;
export function textOutputs(): Record<string, string>;
export function build(): void;
