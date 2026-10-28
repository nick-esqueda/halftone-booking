# halftone-booking

Equipment booking for the Halftone studio: see who has which camera, light or room, book it, and never double-book.

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16
- **Frontend:** React 18 + TypeScript, Vite, TanStack Query, Tailwind
- **Style:** every change follows [CODE-STYLE.md](CODE-STYLE.md) (Black for Python, Prettier for TypeScript)

## Run it

```sh
make up        # db, API and web in Docker, with hot reload
```

Open http://localhost:5173. The API (http://localhost:8000/docs) runs migrations and seeds the equipment list on start.

Prefer running the API and web app directly? `make dev-native`, then `make api` and `make web` in two terminals. You need [uv](https://docs.astral.sh/uv/) and Node 22.

Run `make help` to see every command.

## Test and check

```sh
make check     # Black, ruff, mypy, Prettier, ESLint, tsc, pytest, Vitest
make e2e       # Playwright smoke test; needs the API running (make up)
```

Backend tests need Postgres. They use `booking_test` on localhost by default; set `TEST_DATABASE_URL` to point elsewhere. Postgres is required, not SQLite, because the rule that blocks double-booking is a Postgres exclusion constraint.

CI runs all of the above on every pull request, checks that the generated API types are up to date, and builds the Docker images.

## How it works

- **Studio time.** Every time is shown and entered in the studio's time zone (`America/Chicago`), whatever the browser's zone. The API stores UTC.
- **No double-booking.** `booking_items` has an exclusion constraint: two active items for the same equipment can't overlap. The API checks first so it can name the clash, and turns a lost race into the same 409.
- **Time lives on items.** A booking is who and why; its items hold the time range and cancelled flag. The booking's overall time and status are worked out from its items (in `app/services/booking_times.py`).
- **Business rules live in the API.** The UI only gives quick hints; the API checks everything again.
- **Booking assistant.** People can ask in plain English ("Camera B Thursday after lunch"). `POST /api/assistant/draft` runs a short loop with Claude: the model can only read (list equipment, check availability, find free times) and finishes by proposing a draft or asking a question. Every draft is checked with the booking rules, and nothing is saved until the person presses Book in the form. Vague times get options, never guesses. The code is in `backend/app/assistant/`; house phrases like "after lunch" are in `prompt.py`.
- **Assistant limits.** Each request is capped at a few model calls and seconds, and each client at a few requests a minute (settings in `config.py`). Without `ANTHROPIC_API_KEY` the assistant is switched off and the UI hides it.
- **Assistant evals.** `backend/evals/` holds cases graded against the real model; see its README. They cost money, so CI runs them only by hand, on PRs labelled `run-evals`, and after merges that touch the assistant.
- **API types.** After changing the API, run `make openapi` to regenerate `frontend/src/api/schema.d.ts`.

## Logging

- **Where.** The API logs to the console and, as JSON lines, to `logs/api.log` in the repo root (git-ignored, rotated at 10 MB). `make logs` follows the console; `make tail-logs` follows the file.
- **Request IDs.** Every response has an `X-Request-ID` header, every error body has a matching `request_id`, and every log line carries it. To see everything one request did: `jq 'select(.request_id == "<id>")' logs/api.log`.
- **Levels.** `BOOKING_LOG_LEVEL` is `DEBUG` locally and `INFO` by default. `TRACE` adds every SQL statement. Tune one area with `BOOKING_LOG_LEVELS=app.services=TRACE`.
- **Destinations.** `BOOKING_LOG_SINKS` picks them by name: `console`, `file`, `stdout-json`. To send logs somewhere new, add a sink in `backend/app/observability/sinks.py`.
- **Privacy.** Booker names and purposes appear only at DEBUG and below; passwords, tokens and keys are masked on every sink.

## Configuration

Copy `.env.example` to `.env` to change defaults. API settings use the `BOOKING_` prefix (see `backend/app/config.py`).
