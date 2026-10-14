import type { Report, Rule } from './core.js';
export * from './core.js';
export interface DuplicateOptions {
  baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean;
  /** Jaccard similarity of 5-word shingles at which bodies count as near-duplicates (default 0.9). */
  threshold?: number;
  /** Ignore bodies shorter than this many words (default 50). */
  minWords?: number;
  /** Pages left out of the comparison. */
  ignore?: string[];
  /** Report boilerplate-heavy pages (default true). */
  templateCheck?: boolean;
  now?: Date; toolVersion?: string; [option: string]: unknown;
}
export declare const RULES: Record<string, Rule>;
export declare const SITE_OPTIONS: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }>;
export declare const SITE_HELP: string;
export declare function check(dir: string, opts?: DuplicateOptions, config?: Record<string, unknown>, configFile?: string): Report;
export declare function analyze(site: unknown, opts?: DuplicateOptions, config?: Record<string, unknown>): { findings: Report['findings']; info: Record<string, unknown>; summary: string };
export declare function shingles(text: string, k?: number): Set<string>;
export declare function jaccard(a: Set<unknown>, b: Set<unknown>): number;
export declare function minhash(set: Set<string>, n?: number): Uint32Array;
export declare function titleAffixes(titles: string[]): { suffix: string | null; prefix: string | null };
