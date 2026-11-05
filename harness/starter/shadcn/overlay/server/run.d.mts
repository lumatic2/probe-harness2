export const RESULT_FILE: string
export type RunJob = { state: 'idle' | 'running' | 'done' | 'error'; progress: number; step: string; startedAt: string | null; finishedAt: string | null; params: Record<string, unknown> | null; dataset: string | null; error: string | null }
export type Engine = (input: { params: Record<string, unknown>; datasetDir: string | null; files: Record<string, string>; report: (progress: number, step?: string) => void }) => Promise<unknown>
export function createRun(opts: { root: string; engine: Engine; datasets?: { current: () => { name: string } | null; currentDir: () => string | null; readFiles: (dir: string) => Record<string, string> }; now?: () => Date }): {
  start: (body: unknown) => { status: number; json: Record<string, unknown> }
  status: () => { status: number; json: Record<string, unknown> }
  readResult: () => unknown
}
