export const mean: (xs: number[]) => number | null
export const stdev: (xs: number[]) => number
export const percentile: (xs: number[], p: number) => number | null
export const niceStep: (raw: number) => number
export function niceTicks(lo: number, hi: number, count?: number): { lo: number; hi: number; ticks: number[]; step: number }
export function makeBins(values: number[], want?: number): { edges: number[]; counts: number[]; step: number }
export function binCounts(xs: number[], edges: number[]): number[]
export function controlLimits(ys: (number | null)[], k?: number, fixed?: { center: number; ucl: number; lcl: number } | null, floor0?: boolean): { center: number | null; ucl: number | null; lcl: number | null; sigma: number | null; mode: string }
