import type { IncomingMessage, ServerResponse } from 'node:http'
export const MAX_BODY: number
export const MAX_AUDIO_BODY: number
export const READ_POSTS: Set<string>
export const PROTECTED_STORE: Set<string>
export class HttpError extends Error { status: number; constructor(status: number, message: string) }
export function sendJson(res: ServerResponse, code: number, obj: unknown): void
export function readBody(req: IncomingMessage, max?: number): Promise<string>
export function readJsonBody(req: IncomingMessage, max?: number, emptyOk?: boolean): Promise<unknown>
type Out = { status: number; json: Record<string, unknown> }
type AuthOut = Out & { cookie?: string }
export function createApi<U>(opts: {
  root: string
  ai?: { enabled: boolean; model?: string } // health 가 「AI 키가 있나」를 알려 주는 데 쓴다
  auth: { enabled: boolean; me: (cookie: unknown) => AuthOut; login: (body: unknown) => AuthOut; logout: (cookie: unknown) => AuthOut; userFrom: (cookie: unknown) => U | null; canWrite: (user: U | null) => boolean }
  assist: (body: unknown) => Promise<Out>
  chat: (body: unknown) => Promise<Out>
  transcribe: (body: unknown) => Promise<Out>
  datasets: { list: () => Out; validate: (body: unknown) => Out; apply: (body: unknown) => Out }
  run: { start: (body: unknown) => Out; status: () => Out }
  maxBody?: number
  maxAudioBody?: number
}): {
  handle: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => Promise<void>
  middleware: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => Promise<void>
}
