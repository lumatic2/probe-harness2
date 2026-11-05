// xlsx.mjs 의 타입 선언 — 화면(TSX)이 쓰는 모양만 느슨하게 적는다. 규칙은 xlsx.mjs 가 정본.
import type { Ctx, Row } from './core.mjs'
export type XlsxCell = null | string | number | { v: string | number | null; kind?: 'num' | 'date' | 'datetime'; dec?: number; bold?: boolean; title?: boolean }
export type XlsxSheet = { name: string; widths?: number[]; rows: XlsxCell[][]; freeze?: boolean; filter?: boolean }
export const XLSX_MIME: string
export const crc32: (bytes: Uint8Array) => number
export const zipStore: (files: { name: string; data: Uint8Array }[]) => Uint8Array
export const excelSerial: (s: unknown) => number | null
export const sheetName: (s: unknown) => string
export const buildXlsx: (sheets: XlsxSheet[]) => Uint8Array
export const filterParts: (ctx: Ctx, state: Record<string, any>, extra?: string[]) => string[]
export const xlsxFileName: (ctx: Ctx, parts?: string[]) => string
export const buildReportWorkbook: (ctx: Ctx, state: Record<string, any>, opts: { rows: Row[]; keys?: string[]; cmp?: [Record<string, any>, Record<string, any>]; extra?: string[] }) => XlsxSheet[]
export const downloadXlsx: (name: string, bytes: Uint8Array) => void
