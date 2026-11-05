// core.mjs 의 타입 선언 — 화면(TSX)이 쓰는 모양만 느슨하게 적는다. 규칙은 core.mjs 가 정본.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>
export type Route = { page: string; id?: string; period: string; group: string; [k: string]: string | undefined }
export type Ctx = { d: any; raw: any; settings: Record<string, any>; s: any; rows: Row[]; byKey: Record<string, any>; R: Record<string, any>; today: string }
export const esc: (s: unknown) => string
export const fmt: (n: number | null | undefined, d?: number) => string
export const sign: (n: number, d?: number) => string
export const PERIODS: { v: string; label: string; n: number }[]
export const ALL: string
export const DEFAULT_STATE: { period: string; group: string }
export const WEEKDAYS: string[]
export const SLOTS: string[]
export const DOMAIN_NAME_RE: RegExp
export const addDays: (d: string, n: number) => string
export const daysBetween: (a: string, b: string) => number
export const weekdayIndex: (d: string) => number
export const mmdd: (d: string) => string
export const shortTs: (ts: unknown) => string
export const periodLabel: (v: string) => string
export function parseHash(hash: string): Route
export function buildHash(page: string, query?: Record<string, string | undefined>, id?: string): string
export function linkTo(page: string, state: { period: string; group: string }, extra?: Record<string, string>, id?: string): string
export const activeFilters: (state: Record<string, any>) => [string, string][]
export function makeCtx(domain: any, sample: any, saved?: Record<string, any>): Ctx
export const tone: (ctx: Ctx, key: string | null | undefined, v: unknown) => string
export const rankOf: (ctx: Ctx, key: string, v: unknown) => number
export const nameOf: (ctx: Ctx, key: string, v: any) => any
export function display(ctx: Ctx, key: string, v: unknown): string
export const dateOf: (ctx: Ctx, row: Row) => string
export const idOf: (ctx: Ctx, row: Row) => string
export function tpl(ctx: Ctx, str: string, row?: Row, extra?: Record<string, unknown>): string
export const titleOf: (ctx: Ctx, row: Row) => string
export function isDone(ctx: Ctx, row: Row): boolean
export function dday(ctx: Ctx, row: Row): number | null
export const ddayLabel: (n: number | null) => string
export const isOverdue: (ctx: Ctx, row: Row) => boolean
export function ddayText(ctx: Ctx, row: Row): string
export function isUrgent(ctx: Ctx, row: Row): boolean
export function matchWhere(ctx: Ctx, row: Row, where?: Record<string, any>): boolean
export const whereToFilters: (where?: Record<string, any>) => Record<string, string>
export function tableCols(ctx: Ctx, app?: 'shadcn'): any[]
export const colLabel: (ctx: Ctx, key: string) => string
export function cell(ctx: Ctx, row: Row, key: string): { text: string; tone: string }
export function distinct(ctx: Ctx, key: string): string[]
export function windowDates(ctx: Ctx, state: { period: string }, back?: number): string[]
export function rowsIn(ctx: Ctx, dates: string[], group?: string): Row[]
export const hasPrev: (ctx: Ctx, state: { period: string }) => boolean
export const groupLabel: (ctx: Ctx) => string
export const groupAll: (ctx: Ctx) => string
export const groupName: (ctx: Ctx, g?: string) => string
export const metricDef: (ctx: Ctx, key: string) => any
export function metricsFor(ctx: Ctx, dates: string[], group?: string): Record<string, any>
export function sortRows(ctx: Ctx, rows: Row[], key?: string, dir?: 'asc' | 'desc'): Row[]
export function filterRows(ctx: Ctx, state: Record<string, any>): Row[]
export const findRow: (ctx: Ctx, id: string) => Row | undefined
export function relatedRows(ctx: Ctx, row: Row): Row[]
export function evidenceLines(ctx: Ctx, row: Row): string[]
export function rulesFor(ctx: Ctx, row: Row): { applied: any[]; others: any[] }
export const rawLines: (ctx: Ctx, row: Row) => [string, string][]
export function toCsv(ctx: Ctx, rows: Row[], keys?: string[]): string
export const csvFileName: (ctx: Ctx) => string
export const NOTICE_SEPARATOR: string
export function makeNotices(ctx: Ctx, rows: Row[]): string
export const noticeFileName: (ctx: Ctx) => string
export function buildInputs(ctx: Ctx, state: Record<string, any>): Record<'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6' | 'w7' | 'w8' | 'w9' | 'w10' | 'w11' | 'w12' | 'w13' | 'w14' | 'w15' | 'w16', any>
export function buildSummary(ctx: Ctx, state: Record<string, any>): string
export function memoLine(ctx: Ctx, row: Row): string
export function buildMemo(ctx: Ctx, state: Record<string, any>): string
export function compareDiff(a: number | null | undefined, b: number | null | undefined): number | null
export function compareRows(ctx: Ctx, m: Record<string, any>): [string, number | null, number][]
export function formOpenRows(ctx: Ctx, route?: { id?: string }): Row[]
export function validate(ctx: Ctx, v: Record<string, any>): Record<string, string>
export function makeDecision(ctx: Ctx, existing: unknown[], v: Record<string, any>, ts: string, who?: string): Record<string, any>
export function valueOf(ctx: Ctx, row: Row, spec: any): number
export { niceTicks } from './stats.mjs'
// 기준값(params) · 판정(judge) · 가정 바꿔 보기(whatIf)
export type ParamDef = { key: string; label: string; unit?: string; type: 'number' | 'enum' | 'bool'; default: any; min?: number; max?: number; step?: number; options?: (string | { v: string; label?: string })[]; affects?: string }
export type ParamChange = { key: string; label: string; unit: string; from: string; to: string }
export type SettingsEntry = ParamChange & { ts: string; reason: string }
export type SettingsSaved = { values: Record<string, any>; history: SettingsEntry[] }
export type WhatIfMetric = { key: string; label: string; unit: string; decimals: number; before: number | null; after: number | null; diff: number | null; targetBefore: number | null; targetAfter: number | null; metBefore: boolean | null; metAfter: boolean | null }
export type WhatIfResult = { changed: ParamChange[]; metrics: WhatIfMetric[]; flips: { has: boolean; count: number; rows: { id: string; title: string; before: string; after: string }[]; moves: { from: string; to: string; n: number }[] }; basis: string; after: Record<string, any> }
export const PARAM_REF: string
export const WHATIF_STATE: { period: string; group: string }
export const paramDefs: (domain: any) => ParamDef[]
export const optionValue: (o: any) => string
export function paramError(def: ParamDef, v: unknown): string
export function paramValues(domain: any, saved?: Record<string, any> | null): Record<string, any>
export function validateParams(domain: any, values: Record<string, any>): Record<string, string>
export function resolveParams(node: any, values: Record<string, any>): any
export function paramText(def: ParamDef, v: unknown): string
export function diffParams(domain: any, before: Record<string, any>, after: Record<string, any>): ParamChange[]
export const customParams: (ctx: Ctx) => ParamChange[]
export function settingsNote(ctx: Ctx): string
export function makeSettingsRecord(domain: any, saved: SettingsSaved | null | undefined, values: Record<string, any>, reason: string, ts: string): { errors: Record<string, string> } | { errors?: undefined; saved: SettingsSaved; entries: SettingsEntry[] }
export function judgeLabel(ctx: Ctx, row: Row): string | null
export function whatIf(ctx: Ctx, overrides?: Record<string, any>, state?: { period: string; group: string }): WhatIfResult
