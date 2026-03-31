# The Trip Culling Game

A group trip voting app. Players submit destination proposals, everyone votes with a limited point budget, and the game narrows it down until a winner is decided. If there's a tie, a draw phase starts automatically with a re-vote between the tied destinations.

## Stack

| Layer | Technology |
|---|---|
| Framework | Astro 5 (SSR, Node adapter) |
| Database | Supabase (PostgreSQL + Storage) |
| Email | Resend |
| Image processing | Sharp |
| Deployment | Docker |

---

## Roles

| Role | How to get it | Capabilities |
|---|---|---|
| **Player** | Added by an admin | Log in, submit a destination, vote, update profile |
| **Admin** | Granted by a Game Master | All player actions + manage settings, advance phases, manage participants, reveal destination creators |
| **Game Master** | Set via `GAME_MASTER_EMAILS` env var | All admin actions + grant/revoke admin roles, reset database, manage other game masters |

Game Masters are seeded automatically on first startup from the `GAME_MASTER_EMAILS` environment variable. They cannot be demoted through the admin UI.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — full DB access, keep secret |
| `SUPABASE_ANON_KEY` | Anon/public key |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `GAME_MASTER_EMAILS` | Comma-separated emails seeded as Game Masters on first start |
| `SITE_URL` | Public URL of the app, no trailing slash (e.g. `https://the-trip-culling-game.lucaskruger.com`). Used in email links and invitations. Defaults to `http://localhost:4321`. |

> **Warning:** Never commit `.env`. It is listed in `.gitignore`. Rotate any keys that were accidentally exposed.

---

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy your **Project URL**, **Service Role Key**, and **Anon Key** from **Settings → API**.
3. Open **SQL Editor** in the Supabase dashboard, paste the contents of `supabase/schema.sql`, and run it.
4. Create a **Storage bucket** named `destination-photos` with public read access. This is where destination photos are stored as WebP.

---

## Resend Setup

1. Create an account at [resend.com](https://resend.com).
2. Go to **Domains** and add + verify your sending domain (or use the sandbox domain for testing).
3. Go to **API Keys** and create a key with send access.
4. Set `RESEND_API_KEY` in your `.env`.

The app sends email for:
- Login codes (passwordless auth)
- Admin verification codes (phase changes, settings, game restart)
- Player notifications (destination removed, phase updates, winner announcement)
- Invitation emails

---

## Running Locally

```bash
npm install
npm run dev
```

The app runs at `http://localhost:4321`.

---

## Docker

A `docker-compose.yml` is included for production and a `docker-compose.dev.yml` for local development with hot reload.

```bash
# Production
docker-compose up --build

# Development
docker-compose -f docker-compose.dev.yml up --build
```

The seed script (`scripts/seed.js`) runs automatically on container start and inserts the Game Master accounts from `GAME_MASTER_EMAILS` plus the default settings row.

---

## Game Flow

```
SUBMISSION PHASE
  Players submit destination proposals (name + up to 5 photos).
  Only one submission per player allowed.

VOTING PHASE
  Each player distributes a fixed point budget across destinations.
  Point options are configurable (default: 10 / 50 / 100).
  Bonus points can be awarded for having a profile photo or having submitted a destination.

DRAW PHASE  (only if there's a tie)
  Automatically triggered when voting ends with multiple destinations sharing the top score.
  The admin selects which tied destinations enter the draw and sets a duration (default 24h).
  Votes are reset for those destinations only; everyone votes again.

DECIDED
  The destination with the most points wins.
  Admin can restart the game (keeps players and destinations, clears all votes, sets new deadlines).
```

---

## Authentication

Login is passwordless. The app sends a 6-digit code to the user's email; entering it creates a session cookie. Admin actions (advancing phases, changing settings, restarting the game) take effect immediately with no additional confirmation step beyond the browser `confirm()` dialog.

---

## Database Schema

| Table | Purpose |
|---|---|
| `participants` | Players and admins with session tokens and profile data |
| `destinations` | Submitted trip destinations with photos (JSONB array) |
| `votes` | Per-player, per-destination point allocations |
| `settings` | Single-row game configuration (deadlines, point options, bonuses) |

---

## Images

- Destination photos are uploaded as-is and converted to WebP by Sharp before storage.
- Avatars are uploaded and converted to WebP.
- Source images (misc/, avatars/) are excluded from git via `.gitignore`.
- Favicon and OG image assets in `public/` are committed as they are already optimized output files.
