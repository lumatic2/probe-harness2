import type { Ctx, Row } from './core.mjs'
export type ReviewRecord = { tags: string[]; reason: string; status: string; ts: string; who: string }
export type ReviewSaved = Record<string, ReviewRecord>
export const isUncertain: (cfg: any, row: Row) => boolean
export const tagsOf: (cfg: any, row: Row) => string[]
export function mergedRows(ctx: Ctx, saved?: ReviewSaved): Row[]
export function reviewList(ctx: Ctx, saved: ReviewSaved, opts?: { filter?: 'all' | 'uncertain' | 'done' | 'todo'; minConf?: number | null; q?: string }): Row[]
export const reviewCounts: (ctx: Ctx, saved: ReviewSaved) => { all: number; uncertain: number; done: number }
export const addTag: (tags: string[], tag: string) => string[]
export const removeTag: (tags: string[], tag: string) => string[]
export const tagChoices: (cfg: any, tags: string[]) => string[]
export const validateReview: (cfg: any, tags: string[], reason: string) => { tags?: string; reason?: string }
export const makeRecord: (cfg: any, tags: string[], reason: string, ts: string) => ReviewRecord
