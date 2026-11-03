# Farm Poultry Dashboard

Poultry Hub serves farm dashboards and a SQLite-backed API. Account access requires email verification: users register with an email and password, receive a one-time link, verify their address, and then sign in before opening a dashboard.

## Requirements and startup

- Node.js 18 or newer
- npm
- SMTP credentials to deliver verification emails

```bash
npm install
npm start
```

Open `http://localhost:3000` (or set `PORT`). Configure email and session settings before public deployment:

```bash
PORT=3000
PUBLIC_ORIGIN=https://your-domain.example
SESSION_SECRET=use-a-long-random-secret
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM=Poultry Hub <no-reply@your-domain.example>
```

`PUBLIC_ORIGIN` must be the externally reachable HTTPS origin in production. Set `SESSION_SECRET` to a long, unique random value and keep SMTP credentials secret; never commit them. In production, the login cookie is marked `Secure`, so serve the app over HTTPS. Store `data/farm.db` on persistent storage and back it up.

## Email verification and login

1. Visit `/signup.html` and submit an email plus a password (10–128 characters).
2. Follow the emailed verification link within 30 minutes. The link verifies the address and redirects to `/login.html`.
3. Sign in with the verified email and password. A signed, HttpOnly, SameSite=Lax cookie is issued for seven days.
4. Dashboard HTML pages redirect unauthenticated users to login.

SMTP is required to send verification links. If SMTP is not configured or delivery fails, the API reports an error; it never exposes verification tokens in the browser response. Registration responses avoid disclosing whether an email is already registered.

## API

- `GET /api/health`
- `POST /api/auth/register` — JSON `{ "email": "...", "password": "..." }`
- `POST /api/auth/resend-verification` — JSON `{ "email": "..." }`
- `GET /api/auth/verify?token=...` — verifies and redirects to login
- `POST /api/auth/login` — JSON `{ "email": "...", "password": "..." }`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- Existing consumer CRUD endpoints: `/api/consumers`

## Deployment note

The account email-verification flow needs a Node.js host with a writable persistent database and reachable SMTP provider. Static-only hosting such as GitHub Pages cannot run the server or send verification mail.
