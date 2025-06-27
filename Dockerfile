# 멀티스테이지 빌드
FROM node:20-alpine AS base

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 개발 의존성 포함 설치
RUN npm ci

# 소스 코드 복사
COPY . .

RUN chown -R node:node /app
USER node

# 개발 환경
FROM base AS development
COPY .env ./
EXPOSE 3000
CMD ["npm", "run", "start:dev"]


# 빌드 스테이지
FROM base AS build
RUN npm run build

# 프로덕션 환경
FROM node:20-alpine AS production

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 빌드된 파일 복사
COPY --from=build /app/dist ./dist

# 비루트 사용자 생성
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# 소유권 변경
RUN chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

CMD ["node", "dist/main"]