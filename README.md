# Tunerush

Real-time multiplayer music guessing game. TypeScript, Express, MongoDB, React (Socket.IO arrives in Phase 3).

**Status:** v0.2.0. Auth and rooms REST API done. The game engine and real-time play are not built yet.

## Requirements

- Node 25 (see `.nvmrc`)
- Docker (for local MongoDB)

## Setup

```bash
npm ci
cp apps/server/.env.example apps/server/.env   # then set JWT_ACCESS_SECRET
docker compose up -d
npm run dev:server   # http://localhost:5000/health
npm run dev:client   # http://localhost:5173
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Scripts

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run lint`         | oxlint                                              |
| `npm run format`       | oxfmt (write)                                       |
| `npm run format:check` | oxfmt check                                         |
| `npm run typecheck`    | TypeScript across all workspaces                    |
| `npm test`             | Vitest (server), includes the real-MongoDB contract |
| `npm run build`        | Build shared, server and client                     |

## API

Base path `/api/v1`. Errors always look like `{ "error": { "code", "message", "details?" } }`.

**Auth** means a valid `Authorization: Bearer <access token>` header. Guest tokens count as auth unless the row says "registered user".

| Method | Path                 | Auth               | Purpose                                                       |
| ------ | -------------------- | ------------------ | ------------------------------------------------------------- |
| GET    | `/health`            | none               | Liveness (outside `/api/v1`)                                  |
| GET    | `/ready`             | none               | 200 if MongoDB is reachable, else 503                         |
| POST   | `/auth/register`     | none, rate-limited | Create an account, returns access token + sets refresh cookie |
| POST   | `/auth/login`        | none, rate-limited | Log in (lockout after repeated failures)                      |
| POST   | `/auth/guest`        | none, rate-limited | Get a short-lived guest token (not stored in DB)              |
| POST   | `/auth/refresh`      | refresh cookie     | Rotate the refresh token, return a new access token           |
| POST   | `/auth/logout`       | refresh cookie     | Revoke the refresh token and clear the cookie                 |
| GET    | `/auth/me`           | access token       | Who the token says you are                                    |
| GET    | `/users/me`          | registered user    | Your profile                                                  |
| PATCH  | `/users/me`          | registered user    | Update your profile                                           |
| GET    | `/users/:uid`        | registered user    | Another user's public profile                                 |
| POST   | `/rooms`             | access token       | Create a room (server generates the code), you are host       |
| POST   | `/rooms/join`        | access token       | Join by code (atomic, max 8 players)                          |
| GET    | `/rooms/:code`       | access token       | Read a room (public shape, no song ids)                       |
| PATCH  | `/rooms/:code`       | host only          | Change settings (rounds, durationSec, language)               |
| POST   | `/rooms/:code/leave` | access token       | Leave a room                                                  |

`/auth/refresh` and `/auth/logout` also check the `Origin` header against `CORS_ORIGINS`. The refresh cookie is httpOnly with path `/api/v1/auth`.

## Environment variables

Read and validated at startup in `apps/server/src/config/env.ts`. The server refuses to start if one is invalid.

| Variable                   | Required | Default                 | Notes                                          |
| -------------------------- | -------- | ----------------------- | ---------------------------------------------- |
| `NODE_ENV`                 | no       | `development`           | `development`, `test` or `production`          |
| `PORT`                     | no       | `5000`                  |                                                |
| `MONGO_URI`                | yes      | none                    | e.g. `mongodb://localhost:27017/tunerush`      |
| `LOG_LEVEL`                | no       | `info`                  | pino level                                     |
| `JWT_ACCESS_SECRET`        | yes      | none                    | At least 32 characters                         |
| `ACCESS_TOKEN_TTL_SECONDS` | no       | `900`                   | 15 minutes                                     |
| `GUEST_TOKEN_TTL_SECONDS`  | no       | `21600`                 | 6 hours                                        |
| `REFRESH_TOKEN_TTL_DAYS`   | no       | `30`                    |                                                |
| `LOGIN_MAX_FAILURES`       | no       | `5`                     | Failed logins before lockout                   |
| `LOCKOUT_MINUTES`          | no       | `15`                    |                                                |
| `CORS_ORIGINS`             | no       | `http://localhost:5173` | Comma-separated list                           |
| `COOKIE_SAMESITE`          | no       | `lax`                   | `lax`, `strict` or `none`                      |
| `TRUST_PROXY`              | no       | `0`                     | Number of proxies in front (set when deployed) |
| `AUTH_RATE_LIMIT_MAX`      | no       | `20`                    | Requests per window on register/login/guest    |
| `API_RATE_LIMIT_MAX`       | no       | `300`                   | Requests per window on the rest of the API     |

## Known limitations

- Register answers 409 for an existing email, so someone can test whether an email is registered. Hiding this needs email verification, which is outside the current scope.
- An access token cannot be revoked before it expires (15 minutes). Logout revokes the refresh token only.
- Lockout can be used to annoy a known user by failing their login on purpose. The per-IP rate limit makes this harder but not impossible.
- No email verification or password reset yet.
- The in-memory rate limiter counts per server instance. With several instances it needs a shared store (Phase 7).
- Socket authentication and payload validation are not built yet (Phase 3).
- No OpenAPI docs yet.

## Docs

Architecture decisions live in `docs/adr`.
