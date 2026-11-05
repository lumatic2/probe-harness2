export const DEFAULT_MODEL: string
export const TIMEOUT_MS: number
export const OPENAI_URL: string
export const NO_BASIS: string
export const NO_DOC: string
export type Passage = { doc: string; n: number; text: string }
export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export function parseChatBody(body: unknown): { error?: string; value?: { messages: ChatMessage[]; context: string; docs?: boolean; passages?: Passage[] } }
export function mockReply(v: { messages?: ChatMessage[]; context?: string; docs?: boolean; passages?: Passage[] }): string
export function createChat(opts?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; timeoutMs?: number }): (body: unknown) => Promise<{ status: number; json: Record<string, unknown> }>
