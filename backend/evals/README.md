# Assistant evals

The unit tests check the app around the model with a scripted fake. These
evals check the model's own choices: does "Camera B Thursday after lunch"
become Camera B, 1:00 PM to 3:00 PM? Does a vague request get options rather
than a guess?

They call the real model, so each run costs money. They run in CI only by
hand, on PRs labelled `run-evals`, and after merges to main that touch the
assistant (see `.github/workflows/evals.yml`).

## Running locally

From the repo root, with Postgres running and `ANTHROPIC_API_KEY` set:

```sh
make evals
# or one case, from backend/:
uv run python -m evals.run_evals --case "weekend" --pass-rate 1
```

It wipes the database at `EVAL_DATABASE_URL` (the test database by default).

## Writing a case

Cases live in `cases.json`. "Now" is always Tue Oct 27 2026, 10:30 AM studio
time, and all times are studio wall-clock times (`2026-10-29T13:00`).

| Field | Meaning |
|---|---|
| `name` | Short and unique. |
| `message` | What the person types. |
| `booker_name` | Optional, the "Booking as" name. |
| `history` | Optional earlier messages: `{"role": "user" or "assistant", "text"}`. |
| `bookings` | Optional bookings that exist first: `booker_name`, `equipment` (names), `starts_at`, `ends_at`, `purpose`. |
| `expect` | What a good reply looks like. Only the fields given are checked. |

`expect` fields:

| Field | Passes when |
|---|---|
| `kind` | The reply is `"draft"`, `"question"` or `"message"` (or any in a list). |
| `equipment` | The draft has exactly these items. |
| `equipment_includes` | The draft has at least these items. |
| `excluded_equipment` | No draft or option uses these items. |
| `categories` | The draft has this many items per category, e.g. `{"camera": 1}`. |
| `starts_at`, `ends_at` | The draft starts or ends at this time. |
| `purpose_contains` | The draft's purpose contains this text (any case). |
| `min_options` | The question offers at least this many options. |
| `options_date` | Every option starts on this date (`2026-10-30`). |
| `options_equipment` | Every option has exactly these items. |

To add a new kind of check, see `grading.py`.
