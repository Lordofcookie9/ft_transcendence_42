# Stage 1: Build frontend
FROM node:20 AS frontend-builder

WORKDIR /app/frontend

# Install frontend dependencies
COPY frontend/package.json ./
RUN npm install

# Copy source files
COPY frontend/ ./
COPY backend/tailwind.config.js ../backend/tailwind.config.js

# Build Tailwind CSS using the config from backend
RUN npx tailwindcss -i ./input.css -o ./tailwind.css --config ../backend/tailwind.config.js --minify

# Transpile TypeScript manually
RUN npx tsc

# Stage 2: Backend container
FROM node:20

WORKDIR /app

# Install system dependencies needed for sqlite3 native bindings
RUN apt-get update && \
    apt-get install -y sqlite3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install backend dependencies (including sqlite3 from package.json)
COPY backend/package.json ./
RUN npm install

# Copy backend source and certs
COPY backend/ ./
COPY cert/ ../cert/
COPY backend/tailwind.config.js ./backend/tailwind.config.js

# Copy built frontend output from builder
COPY --from=frontend-builder /app/frontend/index.html ./public/index.html
COPY --from=frontend-builder /app/frontend/tailwind.css ./public/tailwind.css
COPY --from=frontend-builder /app/frontend/main.js ./public/main.js

# Ensure /app/db exists (needed for SQLite)
RUN mkdir -p /app/db

# Expose HTTPS port
EXPOSE 443

CMD ["node", "server.js"]
