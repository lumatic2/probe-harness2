export const MIN_COVERAGE: number
export const MAX_PARAGRAPH: number
export type Paragraph = { doc: string; n: number; heading: string; text: string }
export type Selected = Paragraph & { score: number; coverage: number }
export const docsEnabled: (d: any) => boolean
export function buildParagraphs(files: Record<string, string>): Paragraph[]
export function selectPassages(paragraphs: Paragraph[], query: string, opts?: { k?: number }): Selected[]
export function firstSentence(text: string): string
export function passagesForRequest(selected: Paragraph[]): { doc: string; n: number; text: string }[]
export function citedRefs<T extends { doc: string; n: number }>(reply: string, passages: T[]): T[]
export function loadDomainDocs(globbed: Record<string, string>, name: string): Record<string, string>
