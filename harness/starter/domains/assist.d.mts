import type { Row } from './core.mjs'
export type Judgement = { code: 'risk' | 'safe' | 'short'; label: string; message: string; terms: string[]; sentences: { text: string; terms: string[] }[]; count: number }
export const splitSentences: (text: string) => string[]
export const termsFor: (cfg: any, row: Row | undefined) => string[]
export const judgeAnswer: (cfg: any, row: Row | undefined, answer: string) => Judgement
export const segments: (text: string, terms: string[]) => { text: string; mark: boolean }[]
