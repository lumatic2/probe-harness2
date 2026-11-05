export const CURRENT_FILE: string
export const MAX_ERRORS: number
export const MAX_FILE_BYTES: number
export function decodeCsv(buf: Buffer): string
export type DatasetError = { file: string; line: number; column: string; value: string; reason: string }
export type Validation = { ok: boolean; errors: DatasetError[]; summary: { file: string; rows: number }[] }
export type Current = { name: string; at: string; files: { file: string; rows: number }[] }
export function parseCsv(text: string): { headers: string[]; rows: string[][] }
export function validateFiles(files: Record<string, string>, schema: unknown): Validation
export function createDatasets(opts: { root: string; now?: () => Date }): {
  list: () => { status: number; json: Record<string, unknown> }
  validate: (body: unknown) => { status: number; json: Record<string, unknown> }
  apply: (body: unknown) => { status: number; json: Record<string, unknown> }
  current: () => Current | null
  currentDir: () => string | null
  readFiles: (dir: string) => Record<string, string>
}
