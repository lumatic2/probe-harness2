export const COOKIE: string
export const TTL_MS: number
export const LOCK_AFTER: number
export const LOCK_MS: number
export type AuthUser = { id: string; name: string; role: string }
export type AuthResult = { status: number; json: Record<string, unknown>; cookie?: string }
export function parseUsers(text: unknown): { id: string; password: string; role: string; name: string }[]
export function parseCookie(header: unknown): Record<string, string>
export function createAuth(opts?: { env?: Record<string, string | undefined>; now?: () => number; token?: () => string }): {
  enabled: boolean
  quick: boolean
  users: AuthUser[]
  login: (body: unknown) => AuthResult
  logout: (cookieHeader: unknown) => AuthResult
  me: (cookieHeader: unknown) => AuthResult
  userFrom: (cookieHeader: unknown) => AuthUser | null
  canWrite: (user: AuthUser | null) => boolean
}
