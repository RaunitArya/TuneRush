# Tunerush

Real-time multiplayer music guessing game. TypeScript, Express, Socket.IO, MongoDB, React.

## Setup

npm ci
cp apps/server/.env.example apps/server/.env
docker compose up -d
npm run dev:server # http://localhost:5000/health
npm run dev:client # http://localhost:5173
