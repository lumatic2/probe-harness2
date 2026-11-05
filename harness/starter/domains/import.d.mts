// import.mjs 의 타입 선언 — 화면(TSX)이 쓰는 모양만 느슨하게 적는다. 규칙은 import.mjs 가 정본.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type ImportRow = Record<string, any>
export type ImportMeta = { source: string; encoding: string; mode: 'replace' | 'append'; at: string; added: number; skipped: number; total: number }
export type ImportRecord = { rows?: ImportRow[]; meta?: ImportMeta; original?: boolean }
export type ImportTable = { headers: string[]; rows: { cells: string[]; line: number }[]; delim: string; headerLine: number }
export type ImportError = { line: number; key: string; label: string; value: string; reason: string }
export type ImportCheck = {
  total: number; okCount: number; errorRowCount: number; errors: ImportError[]
  records: { line: number; rec: ImportRow; errors: ImportError[] }[]
  okRows: ImportRow[]; missingRequired: string[]; blocked: boolean
}
export const IMPORT_DEFAULT_KB: number
export const PREVIEW_ROWS: number
export const STORE_LIMIT: number
export const importOn: (d: any) => boolean
export const maxBytes: (d: any) => number
export const importCols: (d: any) => any[]
export const requiredKeys: (d: any) => string[]
export const decodeBytes: (bytes: Uint8Array | ArrayBuffer) => { text: string; encoding: string }
export const sniffDelim: (text: string) => string
export const readTable: (text: string) => ImportTable
export const autoMap: (d: any, headers: string[]) => Record<string, number>
export const convertCell: (col: any, raw: unknown, required?: boolean) => { value?: any; error?: string }
export const validateRows: (d: any, table: ImportTable, map: Record<string, number>, opts?: { existingIds?: Set<string> | null }) => ImportCheck
export const mergeRows: (base: ImportRow[], add: ImportRow[], mode: string) => ImportRow[]
export const makeRecord: (a: { rows: ImportRow[]; source: string; encoding: string; mode: 'replace' | 'append'; at: string; added: number; skipped: number }) => ImportRecord
export const fitsStore: (rec: unknown) => boolean
export const hasImported: (rec: unknown) => boolean
export const canRevert: (prev: unknown) => boolean
export const revertRecord: (prev: ImportRecord) => ImportRecord
export const prevFor: (current: ImportRecord) => ImportRecord
export const applyImported: (sample: any, rec: ImportRecord | null | undefined) => any
export const importApi: (name: string) => string
export const importPrevApi: (name: string) => string
