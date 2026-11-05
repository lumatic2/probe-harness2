import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect } from 'vite'
import { createApi } from './server/api.mjs'
import { createAssist } from './server/assist.mjs'
import { createAuth } from './server/auth.mjs'
import { createChat } from './server/chat.mjs'
import { createDatasets } from './server/datasets.mjs'
import { runEngine } from './server/engine.mjs'
import { createRun } from './server/run.mjs'
import { createTranscribe } from './server/transcribe.mjs'

// 이 파일은 「환경변수 → 서비스 객체 → /api 미들웨어 등록 → 빌드 설정」만 한다. 라우팅 분기(인증·메서드·상한·저장물)는 server/api.mjs, 모듈 지도는 INTEGRATION.md 「서버 모듈 지도」.
// 개발 서버(npx vite)와 preview(빌드본)가 같은 미들웨어를 쓴다. 포트는 PORT 환경변수(기본 3000).
// 비밀(OPENAI_*·AUTH_*)은 서버 프로세스 환경변수 또는 앱 폴더의 .env(커밋 금지)에서만 읽는다 — 화면 번들에는 들어가지 않는다.
const ROOT = import.meta.dirname
const PORT = Number(process.env.PORT) || 3000
const fileEnv = loadEnv('production', ROOT, ['OPENAI_', 'AUTH_'])
const env = (k: string) => process.env[k] ?? fileEnv[k]
const aiEnv = { OPENAI_API_KEY: env('OPENAI_API_KEY'), OPENAI_BASE_URL: env('OPENAI_BASE_URL'), OPENAI_MODEL: env('OPENAI_MODEL') }
const authEnv = Object.fromEntries(['AUTH_ON', 'AUTH_USERS', 'AUTH_WRITE_ROLES', 'AUTH_DEFAULT_ROLE'].map((k) => [k, env(k)]))

const auth = createAuth({ env: authEnv })
const datasets = createDatasets({ root: ROOT })
const api = createApi({
  root: ROOT,
  auth,
  assist: createAssist({ env: aiEnv }),
  chat: createChat({ env: aiEnv }),
  transcribe: createTranscribe({ env: { OPENAI_API_KEY: env('OPENAI_API_KEY'), OPENAI_BASE_URL: env('OPENAI_BASE_URL'), OPENAI_STT_MODEL: env('OPENAI_STT_MODEL') } }),
  datasets,
  run: createRun({ root: ROOT, engine: runEngine, datasets }),
})
const apiMiddleware = api.middleware as Connect.NextHandleFunction

// 모듈 경로 → 청크 이름. Vite 8(rolldown)은 함수형만 받는다. 위에서 아래로 처음 맞는 것. 나머지 node_modules 는 App 과 함께 묶인다.
const VENDOR: [string, RegExp][] = [['react-flow', /[\/]node_modules[\/]@xyflow[\/]/], ['recharts', /[\/]node_modules[\/](recharts|d3-[a-z-]+|victory-vendor)[\/]/], ['react', /[\/]node_modules[\/](react|react-dom|scheduler)[\/]/], ['radix', /[\/]node_modules[\/](@radix-ui|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|aria-hidden)[\/]/], ['ui-libs', /[\/]node_modules[\/](@tanstack|@dnd-kit|vaul|sonner|lucide-react|cmdk|next-themes|class-variance-authority|clsx|tailwind-merge)[\/]/]]
function vendorChunk(id: string) { return VENDOR.find(([, re]) => re.test(id))?.[0] }

const apiPlugin = () => ({
  name: 'local-json-api',
  configureServer(server: { middlewares: Connect.Server }) { server.middlewares.use(apiMiddleware) },
  configurePreviewServer(server: { middlewares: Connect.Server }) { server.middlewares.use(apiMiddleware) },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  resolve: { alias: { '@': path.resolve(ROOT, './src') } },
  // allowedHosts: 플랫폼 Browser 는 *.e2b.app Host 로 요청한다 — 없으면 Vite 가 「Blocked request … host is not allowed」(타 참가자 보고). 접미사 하나만 더하는 것이라 로컬엔 영향 없다.
  server: { host: '0.0.0.0', port: PORT, strictPort: true, allowedHosts: ['.e2b.app'] },
  preview: { host: '0.0.0.0', port: PORT, strictPort: true, allowedHosts: ['.e2b.app'] },
  build: {
    target: 'esnext', // derive.ts 의 top-level await
    // 큰 라이브러리는 따로 묶는다 — App 청크가 2MB 를 넘지 않게(경고 한도 상향 없이). 화면 코드만 바뀌면 이 청크들은 캐시가 그대로 살아 있다.
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
})
