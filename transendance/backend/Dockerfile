# Stage 1: Build frontend
FROM node:20 AS frontend-builder

WORKDIR /app/frontend

# Install frontend dependencies
COPY frontend/package.json ./ 
RUN npm install

# Copy source files
COPY frontend/ ./
COPY backend/tailwind.config.js ../backend/tailwind.config.js

# Build Tailwind CSS (no tailwind.config.js used)
RUN npx tailwindcss -i ./input.css -o ./tailwind.css --config ../backend/tailwind.config.js --minify

# Transpile TypeScript manually
RUN npx tsc

# Stage 2: Backend container
FROM node:20

WORKDIR /app

# Install backend dependencies
COPY backend/package.json ./
RUN npm install

# Copy backend and certs
COPY backend/ ./
COPY cert/ ./cert/
COPY backend/tailwind.config.js ./backend/tailwind.config.js

# Copy built frontend output
COPY --from=frontend-builder /app/frontend/index.html ./public/index.html
COPY --from=frontend-builder /app/frontend/tailwind.css ./public/tailwind.css
COPY --from=frontend-builder /app/frontend/main.js ./public/main.js
COPY --from=frontend-builder /app/frontend/pong ./public/pong

# Expose HTTPS port
EXPOSE 443

CMD ["node", "server.js"]
