# Farm Poultry Dashboard

A poultry farm dashboard app with a lightweight Express backend. It serves three dashboard UIs and includes a SQLite-backed consumer API for persistent records.

## What is included

- Landing page with dashboard selection
- Broiler dashboard
- Kienyeji dashboard
- General poultry dashboard
- Shared frontend utility for health checks and data syncing
- SQLite-backed consumer API

## Requirements

- Node.js 18 or newer
- npm

## Run locally

```bash
npm install
npm start
```

Then open the app in a browser:

```text
http://localhost:3000
```

Custom port:

```bash
PORT=4000 npm start
```

Development mode with auto-reload:

```bash
npm run dev
```

## API

The backend exposes consumer APIs backed by SQLite.

| Method | Route | Description |
| --- | --- | --- |
| GET | /api/health | Health check |
| GET | /api/consumers | List consumers |
| GET | /api/consumers/:id | Fetch one consumer |
| POST | /api/consumers | Create a consumer |
| PUT | /api/consumers/:id | Update a consumer |
| DELETE | /api/consumers/:id | Delete a consumer |

Example:

```bash
curl -X POST http://localhost:3000/api/consumers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Amina",
    "phone": "+254700000000",
    "buyerType": "Retail",
    "eggsOrdered": 12,
    "location": "Nairobi"
  }'
```

## Storage

The database file is created at:

```text
data/farm.db
```

Set `DATA_DIR` if you want to move the database storage directory.

## Notes

- The dashboard data in each HTML page still uses browser `localStorage` for the farm-specific charts and records.
- This is a practical full-stack starter: persistent API storage is available, while page data remains client-side to keep the dashboard experience fast and self-contained.
