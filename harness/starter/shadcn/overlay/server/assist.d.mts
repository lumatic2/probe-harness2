export const DEFAULT_MODEL: string
export const TIMEOUT_MS: number
export const OPENAI_URL: string
export function mockSuggestion(v: { code: string; terms?: string[]; minChars?: number }): string
export function parseBody(body: unknown): { error?: string; value?: { question: string; answer: string; code: string; terms: string[]; sentences: string[]; minChars: number } }
export function createAssist(opts?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; timeoutMs?: number }): (body: unknown) => Promise<{ status: number; json: Record<string, unknown> }>
