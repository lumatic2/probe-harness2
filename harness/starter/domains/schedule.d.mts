import type { Ctx } from './core.mjs'
export type SchedItem = { id: string; row: Record<string, any>; label: string; resource: string; start: string; end: string; edited: boolean; s: number; e: number; lane: number; conflict: boolean; rules: number[]; left: number; width: number }
export type SchedConflict = { rule: number; label: string; key: string; ids: string[]; titles: string[]; startMs: number }
export type SchedModel = {
  cfg: any
  info: { unit: 'day' | 'hour'; slotMs: number; count: number; t0: number; t1: number; slots: { ms: number; label: string; sub: string }[] }
  rows: { resource: string; lanes: number; items: SchedItem[] }[]
  sched: Omit<SchedItem, 'lane' | 'left' | 'width'>[]
  conflicts: SchedConflict[]
  conflictIds: string[]
  unassigned: { id: string; row: Record<string, any>; label: string; resource: string; start: string; end: string; edited: boolean }[]
  count: number
}
export type SchedEdits = Record<string, { start?: string; end?: string; resource?: string }>
export const MIN_MINUTES: number
export const toMs: (s: string) => number
export const toTs: (ms: number) => string
export function slotInfo(cfg: any): SchedModel['info']
export function scheduleModel(ctx: Ctx, edits?: SchedEdits): SchedModel
export function shifted(item: { start: string; end: string }, minutes: number, snap?: number): { start: string; end: string }
export function confirmPayload(model: SchedModel, edits: SchedEdits, ts: string): { ts: string; count: number; edits: SchedEdits } | null
export const toInput: (ts: string) => string
export const fromInput: (v: string) => string
export const validRange: (start: string, end: string) => boolean
export type SchedInfo = SchedModel['info']
export function layoutRows(sched: SchedModel['sched'], view: SchedInfo, minFrac?: number): SchedModel['rows']
export function hourInfo(day: string, from: number, to: number): SchedInfo
export function daysWithItems(sched: SchedModel['sched'], info: SchedInfo): string[]
export function pickScale(scale: string | undefined, sched: SchedModel['sched'], info: SchedInfo): 'hour' | 'day'
export function hourRange(sched: SchedModel['sched'], day: string): [number, number]
export function dayList(info: SchedInfo): { day: string; label: string }[]
