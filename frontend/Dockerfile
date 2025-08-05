# --- Stage 1: Build ---
FROM node:20 as build
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/. ./
COPY backend/tailwind.config.js /app/backend/tailwind.config.js
RUN npx tailwindcss -i ./input.css -o ./tailwind.css --config /app/backend/tailwind.config.js --minify
RUN npx tsc

# --- Stage 2: Serve with Nginx ---
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
RUN mkdir ./pong

COPY --from=build /app/frontend/index.html .
COPY --from=build /app/frontend/tailwind.css .
COPY --from=build /app/frontend/main.js .
COPY --from=build /app/frontend/pong ./pong

# ✅ Copy from ROOT of build context — not relative to Dockerfile!
COPY uploads/default-avatar.png /usr/share/nginx/html/default-avatar.png
COPY cert/cert.pem /etc/nginx/cert/cert.pem
COPY cert/key.pem /etc/nginx/cert/key.pem
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]
