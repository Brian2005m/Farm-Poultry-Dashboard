# Farm Poultry Dashboard

A lightweight farm dashboard app with a Node.js + Express API. The main dashboard pages are static HTML files served by Express, and the app includes a small consumer-management API backed by a JSON file.

## Features

- Multi-dashboard landing page with three poultry dashboard flows
- Broiler, Kienyeji, and general poultry dashboard interfaces
- Lightweight backend API for consumer records
- JSON file persistence with atomic writes
- Easy local startup for development or simple hosting

## Requirements

- Node.js 18 or newer
- npm

## Run locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

Custom port:

```bash
PORT=4000 npm start
```

Development mode with automatic restart:

```bash
npm run dev
```

## API endpoints

The dashboard includes a simple REST API for consumer records.

| Method | Route | Description |
| --- | --- | --- |
| GET | /api/health | Check if the backend is online |
| GET | /api/consumers | List all consumers |
| GET | /api/consumers/:id | Fetch one consumer record |
| POST | /api/consumers | Create a consumer |
| PUT | /api/consumers/:id | Update a consumer |
| DELETE | /api/consumers/:id | Delete a consumer |

Example create request:

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

## Data storage

Consumer records are stored in:

```text
data/consumers.json
```

The server also supports a custom directory via the `DATA_DIR` environment variable if you want to place the storage file somewhere else.

## Notes

- The dashboard pages themselves store browser-side state in `localStorage`.
- The JSON API is designed for lightweight local use or a single-instance deployment.
- For persistent production deployment, use a host with a writable filesystem and keep your data directory backed up.
