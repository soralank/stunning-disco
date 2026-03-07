# =============================================================================
# Multi-stage Dockerfile for stunning-disco voting dApp
# Stage 1: Build the React app
# Stage 2: Serve with nginx
# =============================================================================

# ---- Build Stage ----
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY public/ public/
COPY src/ src/
COPY .env.production .env.production

RUN npm run build

# ---- Production Stage ----
FROM nginx:1.25-alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Healthcheck for orchestrators
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:8080/index.html || exit 1

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
