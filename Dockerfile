# Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY frontend/ ./
RUN npm run build

# Backend + serve static
FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./public
ENV NODE_ENV=production
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
