FROM node:22.9.0-bookworm AS base

# 1. Install dependencies only when needed
FROM base AS deps

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
# https://github.com/pnpm/pnpm/issues/9029
# https://github.com/nodejs/corepack/issues/612
RUN npm install -g corepack@latest
RUN corepack enable pnpm
RUN pnpm i --frozen-lockfile

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Production image, copy all the files and run next
FROM nginx:1.27.4-bookworm AS runner
WORKDIR /app

COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /var/www/out
