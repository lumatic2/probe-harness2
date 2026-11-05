export const DEFAULT_STT_MODEL: string
export const TIMEOUT_MS: number
export const STT_URL: string
export const MAX_AUDIO_BYTES: number
export function mockTranscript(bytes: number): string
export function parseBody(body: unknown): { error?: string; value?: { audio: string; type: string; ext: string; bytes: number } }
export function createTranscribe(opts?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; timeoutMs?: number }): (body: unknown) => Promise<{ status: number; json: Record<string, unknown> }>
