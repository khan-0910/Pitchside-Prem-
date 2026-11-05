# Data sources

Verified by real requests on 2026-11-05. Status on your machine is at `GET /api/v1/data/sources`.

| Source | Auth | Result on 2026-11-05 | Used for |
|---|---|---|---|
| Fantasy Premier League API | None | Works. Season 2026-27, 380 fixtures, 90 played, 670 players | Current fixtures, scores, players, xG/xA, prices, injury news |
| FPL `element-summary` | None | Works. One request per player, weekly | Player totals by past season |
| football-data.co.uk | None | Works. 34 seasons, 1993-94 to now | Results, shots, odds, xG from 2026-27 only |
| transfermarkt-datasets | None | Works, but dump dated 2026-09-05, valuations to 2026-06-10 | Valuations, transfers, appearances |
| football-data.org | Free key | Works. 380 fixtures, 90 results, 20 table rows, scores match FPL | Official standings with point deductions |
| Understat | None | Down: HTTP 200 with a "We will come back soon" page | Team xG when it returns |

## Limitations

- **FPL** is an unofficial public API. Its schema is checked on every load, and a bad payload rolls back and keeps the last good data. FPL price is a game price, stored as `fpl_price`, and never treated as market value.
- **football-data.co.uk** adds and drops bookmakers by year, and only 2026-27 has xG. Finished seasons are fetched once. The `Time` column appears from 2019-20 and is local, so only the date is kept.
- **Transfermarkt** data is a third-party dump, not a live feed. Nothing in this project scrapes Transfermarkt. The health panel marks it STALE because the dump is older than 30 days, even when the download succeeds.
- **football-data.org** free tier allows 10 requests per minute, so the loader waits 6.5 seconds between calls. On first load every club resolved, and no points differed from the table worked out from results.
- **Understat** returns HTTP 200 for its maintenance page, so the loader looks for the page text and not the status code. `soccerdata` is optional and only imported when the site is up. That path has not run against the live site.

## Status meaning

- **LIVE**: the newest attempt reached the provider, inside the source's TTL.
- **CACHED**: the data is usable, but the newest attempt failed or the TTL has passed.
- **STALE**: the last success, or the upstream publish date, is past the stale limit.
- **UNAVAILABLE**: no data has ever loaded.

## Refresh schedule

Set with environment variables in `.env`.

| Data | Default | Note |
|---|---|---|
| FPL fixtures, results, players, prices, injuries | 3 h | One endpoint serves all of these, so the 3 h injury rate covers the rest |
| football-data.org | 6 h | Skipped with no key |
| football-data.co.uk | 24 h | Current season only, with a conditional request |
| FPL player history | 7 days | One request per player |
| Transfermarkt | 7 days | Conditional request |
| Understat | 24 h | Probe first |

A page view never triggers a refresh. Unchanged bytes skip the load step.

## Entity resolution

- Teams: manual override, then known source id, then exact alias, then fuzzy match. Fuzzy needs a score of 90 and a 6-point lead over the next team, or it goes to `unresolved_entities`.
- Players: date of birth first, then name. Two known but different birth dates never match. With no birth date, team, goalkeeper/outfield position and a strong name must all agree.
- Every mapping keeps the original source name, confidence and method in `player_source_ids` or `team_source_ids`.

```bash
python -m scripts.entities list
```

```bash
python -m scripts.entities links --low 0.9
```

```bash
python -m scripts.entities map player transfermarkt 12345 p_abcd "same person"
```
