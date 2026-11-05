# Dockerfile — 빌드한 화면 + /api 서버를 컨테이너 하나로. 레포 루트에 복사해 쓴다(화면 앱 폴더가 src/ui 가 아니면 APP 만 바꾼다). 앱 폴더에 data/ 가 있어야 한다(make.sh 가 data/datasets/schema.example.json 을 둔다 — 지우지 않는다).
#   docker build -t app . && docker run --rm -p 3000:3000 --env-file src/ui/.env app     → http://localhost:3000
# .env 는 이미지에 넣지 않는다 — 실행 때 --env-file 또는 -e 로 준다(.dockerignore 가 막는다). 데이터셋(data/datasets)·씨앗 JSON 은 이미지에 들어가고, 저장물(data/store)은 볼륨으로 남기려면 -v $(pwd)/data/store:/app/data/store.
# 업무 코드(파이썬 엔진 등)를 같은 컨테이너에서 돌리면 아래 「엔진 런타임」 줄을 켠다.
ARG APP=src/ui

FROM node:22-alpine AS build
ARG APP
WORKDIR /app/${APP}
COPY ${APP}/package.json ${APP}/package-lock.json* ./
RUN npm ci --no-audit --no-fund
# src/ 전체를 복사한다 — server/engine.mjs 가 부르는 src/<모듈>/ 이 빌드 때도 있어야 한다
COPY src/ /app/src/
RUN npm run build

FROM node:22-alpine
ARG APP
WORKDIR /app/${APP}
ENV NODE_ENV=production PORT=3000
# 포트를 바꾸려면 -e PORT=8080 -p 8080:8080 (vite.config.ts 가 PORT 를 읽는다)
# 엔진 런타임(파이썬 엔진을 server/engine.mjs 가 child_process 로 부를 때만): RUN apk add --no-cache python3 py3-pip
COPY src/ /app/src/
COPY --from=build /app/${APP}/node_modules ./node_modules
COPY --from=build /app/${APP}/dist ./dist
EXPOSE 3000
# /api/health 는 로그인(AUTH_ON=1)과 무관하게 200 — auth-me 를 쓰면 로그인 켠 컨테이너가 늘 unhealthy 로 뜬다
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null || exit 1
# vite preview = 빌드된 화면 + vite.config.ts 의 /api 미들웨어(같은 포트). strictPort 라 그 포트가 막혀 있으면 바로 실패한다.
CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port ${PORT:-3000}"]
