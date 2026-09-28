# Running this on a new machine

This archive excludes `node_modules`, `.turbo`, `build` and `dist` — they get
regenerated. It DOES include `.env` (dev secrets, local only) and the DB dump
`strike_dev.sql`.

## 1. Prereqs
- Node.js (check root `package.json` engines field for the version)
- PostgreSQL running locally, reachable at the host/port in `.env`

## 2. Restore the database
```
createdb -U postgres strike_dev
psql -U postgres -d strike_dev -f strike_dev.sql
```
(Credentials/db name come from `.env` → DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE.
Adjust the two commands above if you changed them.)

## 3. Install deps (from the repo root — this is a turbo monorepo)
```
npm install
```

## 4. Run
```
npm run dev
```
(Check root `package.json` / `turbo.json` for the exact dev script names if this differs —
apps/server and apps/client each may also have their own `dev` script.)

## Notes
- `.env` in this archive has local dev DB creds (`admin`/`postgres`) — not for production use.
- If migrations drift from the dump (new migrations added after this export), run
  `node ace migration:run` (or the equivalent script) inside apps/server after restoring.
