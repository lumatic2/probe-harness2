// derive.ts — 도메인 설정(src/domain/<이름>/domain.json)과 샘플 데이터를 읽어 화면 맥락(ctx)을 만든다.
// 집계·라우팅·위젯 입력 만들기는 전부 src/domain/core.mjs. 화면 코드는 ctx 만 본다.
// 어느 도메인을 띄울지: 주소의 ?domain=이름 → 빌드 때 환경변수 VITE_DOMAIN → src/domain/active.json 의 active.
// 과제 데이터로 바꿀 때: src/domain/<이름>/ 에 domain.json 과 sample.json 을 두고 위 값 하나를 바꾼다 (starter/DOMAIN.md).
import activeJson from '@/domain/active.json'
import { DOMAIN_NAME_RE, makeCtx, type Ctx } from '@/domain/core.mjs'
import { applyImported, importApi, importPrevApi, type ImportRecord } from '@/domain/import.mjs'
import { loadSource } from '@/domain/source.mjs'

export * from '@/domain/core.mjs'

const domainFiles = import.meta.glob('../domain/*/domain.json', { eager: true, import: 'default' })
// sample.json 은 띄우는 도메인 것만 내려받는다(lazy glob → 도메인마다 따로 청크). eager 로 두면 견본 9종 약 1MB 가 전부 App 청크에 들어간다.
const sampleFiles = import.meta.glob('../domain/*/sample.json', { import: 'default' })

export const DOMAINS = Object.keys(domainFiles).map((k) => k.split('/')[2])

function pickName(): string {
  const q = new URLSearchParams(location.search).get('domain') ?? ''
  const env = (import.meta.env.VITE_DOMAIN as string | undefined) ?? ''
  for (const n of [q, env, (activeJson as { active: string }).active]) if (n && DOMAIN_NAME_RE.test(n) && DOMAINS.includes(n)) return n
  return DOMAINS[0]
}

export const domainName = pickName()
// CSV 올리기로 반영한 데이터(/api/import-<도메인>)가 있으면 샘플의 rows 를 대신한다. domain.json 에 import 키가 있을 때만 읽고, 모듈이 불러질 때 한 번(top-level await) — 반영·되돌리기 뒤에는 화면을 다시 불러 온다.
const domainJson = domainFiles[`../domain/${domainName}/domain.json`] as { import?: unknown; dataSource?: { url: string; label?: string } }
export const baseSample = (await sampleFiles[`../domain/${domainName}/sample.json`]()) as { rows: unknown[] }
const getRecord = (name: string): Promise<ImportRecord> => fetch(`/api/${name}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
export const imported: ImportRecord = domainJson.import && !domainJson.dataSource ? await getRecord(importApi(domainName)) : {}
export const prevImported: ImportRecord = domainJson.import && !domainJson.dataSource ? await getRecord(importPrevApi(domainName)) : {}
// 로그인이 켜져 있고 아직 세션이 없으면(/api/auth-me 401) dataSource 를 읽지 않는다 — 읽으면 401 로 모듈 로드가 실패해 로그인 화면까지 못 간다. App 이 로그인을 그리고, 로그인 뒤 새로고침이 다시 읽는다.
const needLogin = domainJson.dataSource ? await fetch('/api/auth-me', { cache: 'no-store' }).then((r) => r.status === 401).catch(() => false) : false
const sampleData = needLogin ? { ...baseSample, rows: [] } : await loadSource(domainJson, applyImported(baseSample, imported))
export const ctx: Ctx = makeCtx(domainJson, sampleData)
// 저장된 기준값(/api/settings-<도메인>)을 ctx 에 적용한다 — 가져온 데이터 위에 적용하고, ctx 객체를 그 자리에서 바꾸므로 이후 그려지는 모든 화면이 새 기준값으로 계산한다.
export const applySettings = (values: Record<string, unknown>) => { Object.assign(ctx, makeCtx(domainJson, sampleData, values)) }
export const SETTINGS_API = `settings-${domainName}`
export const domain = ctx.d
// 저장된 입력(판정 등)의 /api 이름 — 도메인마다 따로
export const API_NAME = `decisions-${domainName}`

export type Decision = Record<string, string | number> & { id: string; ref: string; who: string; ts: string }
