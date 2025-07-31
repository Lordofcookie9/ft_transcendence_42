# Stage 1: Build frontend
FROM node:20 AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
COPY backend/tailwind.config.js ../backend/tailwind.config.js

RUN npx tailwindcss -i ./input.css -o ./tailwind.css --config ../backend/tailwind.config.js --minify
RUN npx tsc


# Stage 2: Backend container
FROM node:20

WORKDIR /app

RUN apt-get update && \
    apt-get install -y sqlite3 build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY backend/package.json ./
RUN npm install

COPY backend/ ./
COPY cert/ ./cert/
COPY backend/tailwind.config.js ./backend/tailwind.config.js

COPY --from=frontend-builder /app/frontend/index.html ./public/index.html
COPY --from=frontend-builder /app/frontend/tailwind.css ./public/tailwind.css
COPY --from=frontend-builder /app/frontend/main.js ./public/main.js

RUN mkdir -p /app/db

EXPOSE 443

CMD ["node", "server.js"]

