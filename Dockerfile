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

# Build args injected at build time (from CI/CD or docker-compose)
ARG REACT_APP_CONTRACT_ADDRESS
ARG REACT_APP_TOKEN_MANAGER_ADDRESS
ARG REACT_APP_VOTING_PAYMASTER_ADDRESS
ARG REACT_APP_SECRET_BALLOT_MANAGER_ADDRESS
ARG REACT_APP_FRANCHISE_MANAGER_ADDRESS
ARG REACT_APP_VOTING_READER_ADDRESS
ARG REACT_APP_CHAIN_ID
ARG REACT_APP_HARDHAT_RPC
ARG REACT_APP_REFRESH_INTERVAL=15000

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
