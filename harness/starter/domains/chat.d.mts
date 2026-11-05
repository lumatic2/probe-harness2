import type { Ctx } from './core.mjs'
import type { Paragraph } from './docs.mjs'
export type ChatRef = { doc: string; n: number; heading: string; text: string }
export type ChatMsg = { role: 'user' | 'assistant'; content: string; source?: 'openai' | 'mock'; reason?: string; refs?: ChatRef[] }
export type ChatConfig = { title: string; suggestions: string[]; docs?: true }
export const MAX_STORED: number
export const MAX_CONTENT: number
export const MAX_CONTEXT: number
export function chatConfig(d: any): ChatConfig | null
export function chatContext(ctx: Ctx, state: Record<string, any>): string
export function isSendKey(e: { key: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number }): boolean
export const storageKey: (name: string) => string
export function readMessages(raw: string | null): ChatMsg[]
export function appendMessage(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, msg: ChatMsg): ChatMsg[]
export function clearMessages(storage: Pick<Storage, 'removeItem'>, key: string): void
export function requestMessages(messages: ChatMsg[]): { role: 'user' | 'assistant'; content: string }[]
export const badgeText: (m: { source?: string }) => string
export const reasonText: (r?: string) => string
export function askChat(v: { fetchImpl?: typeof fetch; messages: ChatMsg[]; context: string; paragraphs?: Paragraph[] }): Promise<ChatMsg>
