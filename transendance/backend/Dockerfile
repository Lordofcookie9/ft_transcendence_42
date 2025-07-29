# ========================
# Stage 1: Build frontend
# ========================
FROM node:20 AS builder

WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ========================
# Stage 2: Backend + serve frontend
# ========================
FROM node:20

WORKDIR /app

# Copy backend source
COPY backend/ ./

# Copy HTTPS certs
COPY cert/ ./cert/

# Copy built frontend files from builder stage
COPY --from=builder /app/frontend/dist ./public/dist
COPY --from=builder /app/frontend/index.html ./public/index.html
COPY --from=builder /app/frontend/tailwind.css ./public/tailwind.css

RUN npm install

EXPOSE 443

CMD ["node", "server.js"]
