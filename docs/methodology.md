# Model methodology

Figures here are from the training run on 2026-11-05. The live numbers are on the Model Performance page.

## Match predictor

**Target.** Home win, draw or away win, plus home and away goals.

**Features.** All 26 are written from team state before a match, then the match updates that state.

- Strength: Elo with home advantage, goal-margin weighting and a seasonal pull toward the mean. Promoted clubs start low.
- Form: points per game over 5 matches, goals for and against, shots and shots on target over 10, venue points over 10.
- Season: points and goal difference per game, reset each August.
- Context: rest days, capped at 14.
- Squad: total market value and mean goals plus assists per 90 of the likely 14.

Team xG is not a feature. Only 90 matches have it, all from 2026-27. Bookmaker odds are not a feature either, so the market stays an independent yardstick.

**Leakage prevention.**

- `build_match_frame` writes each row before applying that match's result.
- Squad lookups use binary search, and each one stops strictly before the match date.
- Tests change a match's own result and a later result, then assert that earlier rows are identical.
- `split` asserts that train, validation and test dates do not overlap. There are no random splits.
- Live rows use FPL availability, which is known before kickoff. History has no injury data, so it uses who actually played in the previous five matches.

**Splits.** Train 2012-13 to 2022-23. Validation 2023-24 to 2024-25. Test 2025-26 onward. Earlier seasons only warm up Elo.

**Selection.** Logistic regression, random forest, histogram gradient boosting and XGBoost are compared on validation log loss. Logistic regression won, so XGBoost earned no place. Temperature scaling is fitted on validation predictions.

**Goals.** Poisson regression gives expected goals. A score grid from those rates is rescaled to agree with the 1X2 probabilities.

**Result on 470 unseen matches.**

| Forecast | Log loss | Brier | Accuracy |
|---|---:|---:|---:|
| Pitchside | 1.040 | 0.627 | 46.6% |
| Bookmakers, closing | 1.013 | 0.608 | 49.1% |
| Bookmakers, earlier | 1.016 | 0.610 | 49.1% |
| Historical frequencies | 1.085 | 0.657 | 42.1% |

Settings were chosen by walk-forward log loss on seasons 2018-19 to 2024-25, before the test window. Elo constants, longer history and blends gave no real gain. Expected absences are a model input: the share of the usual squad's value that will miss the match. Upcoming games use FPL injury flags and chances. History uses who actually played, as a stand-in for team news, which includes a small amount of in-match information because substitutes count as playing. This input adds almost no measured accuracy. Free sources publish no confirmed lineups before kickoff.

It beats naive baselines and does not beat the market. A walk-forward backtest refits before each season from 2020-21 and shows the same pattern every season.

Each stored prediction carries its build-up, which Match Centre plays step by step. The logistic model scores each outcome as a base value plus one weight times each scaled input, then applies the temperature. The build-up starts from the base value alone, with every input at its training average, which gives a typical match. It then adds the inputs a group at a time: strength, season, form, home and away record, rest, absences. Because the scores add up, the last step equals the stored prediction, and the code checks this before saving. The order is fixed. A different order changes how big each step looks, not where it ends. If the chosen model is not logistic, no build-up is stored.

## Player similarity

**Data.** Per-90 values from FPL: this season plus half of last season, with at least 450 weighted minutes. That gives 352 players.

**Metrics.** xG, xA, goals, assists, threat, creativity, influence, tackles, clearances/blocks/interceptions, recoveries, yellow cards, bonus points, saves, xG conceded and goals conceded. FPL has no shots, key passes, progressive passes, dribbles or aerial duels, so those are absent.

**Method.** Goalkeepers and outfielders are standardised apart and are never compared. Eight position groups come from Transfermarkt positions, falling back to FPL's four. Each group has its own feature weights and list of comparable groups. Weighted cosine gives the score from 0 to 100, which is not a probability. K-Means inside each group, with k from silhouette, gives role names.

**Check.** Using 2026-27 alone, a player's 2025-26 profile lands in their top 10 for 44.6% of 175 players tested. Random picks would manage 3.6%.

## Transfer value

**Target.** `log1p(market_value)` at each valuation date. In effect it estimates the next recorded value. It is not a transfer fee.

**Features.** Age, position, minutes and output over the previous year and the year before it, share of minutes in the Premier League, last season's FPL xG and xA, mean value of the club's recent valuations, last recorded value, its age and its one-year trend. Contract length is left out because the dump only holds today's contract, which would leak.

**Splits.** Train before 2024. Validation 2024. Test 2025 onward.

**Selection.** Linear, ridge, random forest, gradient boosting, histogram gradient boosting and XGBoost, by validation error on the log scale. Histogram gradient boosting won.

**Result on 5,363 unseen valuations.**

| Estimate | Mean error | Median error | R², log scale |
|---|---:|---:|---:|
| Model | €1.90m | €0.76m | 0.973 |
| No change from last value | €2.32m | €1.00m | 0.943 |
| Performance only | €5.52m | €2.59m | 0.833 |

**Uncertainty.** Validation errors by value band give an 80% range. Its real coverage in testing was 78.1%.

**Undervalued rule.** Players are ranked by positive gap. A clear signal needs the low end of the range above the recorded value and at least 450 minutes this season. On 2026-11-05 no player met the clear-signal bar, and the site says so.

**Live scoring.** The dump's appearances stop in June 2026, so current rows rebuild the last 365 days from FPL totals. This is league-only and slightly different from the all-competition history.

## Season simulator

Each remaining fixture samples a scoreline from its score grid. Tables use points, goal difference, goals scored, head-to-head points, head-to-head away goals, then lots in place of a play-off. Runs are seeded and stored with their model version. An identical state and seed reuses the stored run.

Team strength is held fixed within a run, so the real spread is probably wider than shown.

## What-If

A swap edits the likely 14, which changes the squad value and goal output inputs. The real match model then predicts again. Nothing is added by hand. If the outgoing player is outside the likely 14, the inputs do not change and the page says so.
