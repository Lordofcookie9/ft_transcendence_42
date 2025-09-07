# ft_transcendence

A full‑stack, production‑style web app that delivers a **real‑time Pong** experience with **accounts, OAuth (42), 2FA, friends, chat, presence, private games and online tournaments**. The stack is **Fastify + SQLite** on the backend, **TypeScript + Tailwind** on the frontend, served through **Nginx** with **HTTPS**, and monitored by **Prometheus + Grafana + Alertmanager** — all wired with Docker Compose.

---

## Features

- **Single‑Page App (SPA)**: TypeScript frontend (no framework) compiled and served via Nginx.
- **Auth**: Email/password + **OAuth (42)** + **optional 2FA (email or authenticator app)**, JWT in cookies.
- **Profiles**: Avatar upload, rename, password change, delete/anonymize, data export.
- **Friends**: Requests, accept, block; private messages for invites and notifications.
- **Chat**: Public feed and private messages (to/from me), ISO timestamps.
- **Presence**: Heartbeat → online; auto‑offline sweeper; explicit offline on tab close.
- **Game modes**: Private 1v1 invites; room join/roles; WS game channel.
- **Tournaments (online)**: Create lobby, join with alias, start rounds, assign rooms, report winners, abort lobby.
- **Metrics & Monitoring**: `/metrics` (Prometheus client), dashboards via Grafana, alerts via Alertmanager.
- **Security & Ops**: Helmet, CORS, CSRF, rate limiting; HTTPS locally (self‑signed).

---

## Tech Stack

- **Backend**: Node 20, Fastify, SQLite (sqlite3 + sqlite), JWT, bcrypt, Nodemailer, Speakeasy, QRCode, Axios, Prom‑client.
- **Frontend**: TypeScript, Tailwind CSS (CLI), browser Fetch/WebSocket APIs.
- **WebSocket**: `ws` server (game, lobby/tournament broadcasts).
- **Edge**: Nginx (TLS termination, reverse proxy for `/api`, `/ws`, `/uploads`, `/grafana`).
- **Observability**: Prometheus, Grafana, Alertmanager, Node Exporter.
- **Containers**: Dockerfiles for backend & frontend, `docker-compose.yml` to orchestrate.

---

## Repository Layout

```
backend/            # Fastify server, routes, DB, WS, metrics
  app.js            # bootstraps plugins, routes, static, metrics, listen
  server.js         # entrypoint
  db.js             # SQLite schema + indices & pragmas
  routes/           # chat, game, tournament, metrics, presence, monitors
  server/socket.js  # WebSocket hub (rooms + tournaments)
  users/            # authentication, users, uploads, GDPR endpoints
  monitor/          # prom-client metrics endpoint & gauges
frontend/           # SPA (TypeScript + Tailwind), nginx config
  Dockerfile        # build (TS + Tailwind) → serve via nginx
  nginx.conf        # TLS, proxy to backend, /grafana, SPA fallback
monitoring/         # Prometheus, Grafana, Alertmanager configs
cert/               # self-signed cert (dev only)
uploads/            # default avatar + uploaded files (bind-mounted)
db/                 # SQLite file bind-mount (dev)
docker-compose.yml  # services: backend, frontend, prometheus, grafana, alertmanager, node_exporter
Makefile            # helper targets: up/clean/down
```

---

## API Overview

> Base URL is `/api`. Responses are JSON unless stated otherwise. Authenticated routes use the JWT cookie set by login or OAuth callback.

### Auth
- `GET    /api/auth/42`
- `GET    /api/auth/42/callback`
- `PATCH  /api/email`
- `POST   /api/2fa/send-code`
- `POST   /api/2fa/verify-code`
- `PATCH  /api/2fa/change`

### Users & Profile
- `POST   /api/register`
- `POST   /api/login`
- `POST   /api/final-login`
- `POST   /api/logout`
- `GET    /api/user/:id`
- `GET    /api/users`
- `POST   /api/friends/:id/add`
- `POST   /api/friends/:id/cancelAction`
- `POST   /api/friends/:id/accept`
- `POST   /api/friends/:id/block`
- `GET    /api/profile`
- `PATCH  /api/avatar`
- `PATCH  /api/name`
- `PATCH  /api/password`
- `DELETE /api/delete-account`
- `POST   /api/account/anonymize`
- `GET    /api/account/export`
- `PATCH  /api/account/update`

### Chat
- `GET    /api/chat`
- `POST   /api/chat`
- `POST   /api/chat/private`

### Game
- `POST   /api/game/invite`
- `POST   /api/game/room/:id/join`
- `GET    /api/game/room/:id`
- `POST   /api/game/result`

### Presence
- `POST   /api/presence/heartbeat`
- `POST   /api/presence/offline`

### Tournament
- `POST   /api/tournament`
- `GET    /api/tournament/:id`
- `POST   /api/tournament/:id/join`
- `POST   /api/tournament/:id/start`
- `POST   /api/tournament/:id/match/:mid/room`
- `POST   /api/tournament/:id/match/:mid/complete`
- `POST   /api/tournament/:id/abort`

### Metrics
- `GET    /api/count`
- `POST   /api/increment`
- `GET    /metrics`

### Internal (maintenance)
- `GET    /internal/host-monitor/sweep`
- `GET    /internal/inactivity-monitor/sweep`

---

## WebSockets

- Endpoint (behind Nginx): **`wss://localhost/ws/...`**  
  - Game channels: `/ws/game/:roomId` or `/ws/room/:roomId` (optional `/left` or `/right` suffix).  
  - Subprotocol token also supported: `room.<id>.role.left|right` or `r<id>.left|right`.  
- Presence & tournament notifications reuse the same WS server; sockets are indexed by userId and lobbyId for targeted broadcasts.

## Security & Privacy

- The repo contains development‑only TLS certs and sample configs; rotate **all secrets** in `.env` for real deployments.
- Email 2FA requires a real SMTP account. For OTP apps, the project uses **Speakeasy** and **qrcode** to generate secrets/QRs.
- GDPR helpers: profile export, anonymize, delete; plus legal pages in the SPA.
