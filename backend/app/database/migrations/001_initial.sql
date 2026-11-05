-- Core entities
CREATE TABLE competitions (competition_id VARCHAR PRIMARY KEY, name VARCHAR, country VARCHAR);
INSERT INTO competitions VALUES ('PL', 'Premier League', 'England');
CREATE TABLE seasons (
    season_id VARCHAR PRIMARY KEY, start_year INTEGER, end_year INTEGER,
    expected_matches INTEGER, matches_loaded INTEGER, is_complete BOOLEAN
);
CREATE TABLE teams (
    team_id VARCHAR PRIMARY KEY, name VARCHAR NOT NULL, short_name VARCHAR, tla VARCHAR
);
CREATE TABLE team_source_ids (
    source_id VARCHAR, external_id VARCHAR, team_id VARCHAR NOT NULL, source_name VARCHAR,
    confidence DOUBLE, method VARCHAR, matched_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (source_id, external_id)
);
CREATE TABLE players (
    player_id VARCHAR PRIMARY KEY, name VARCHAR NOT NULL, date_of_birth DATE,
    position VARCHAR, sub_position VARCHAR, foot VARCHAR, height_cm DOUBLE,
    nationality VARCHAR, current_team_id VARCHAR, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE player_source_ids (
    source_id VARCHAR, external_id VARCHAR, player_id VARCHAR NOT NULL, source_name VARCHAR,
    confidence DOUBLE, method VARCHAR, matched_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (source_id, external_id)
);
CREATE TABLE entity_aliases (
    entity_type VARCHAR, entity_id VARCHAR, alias VARCHAR, normalized VARCHAR, source_id VARCHAR,
    PRIMARY KEY (entity_type, normalized)
);
CREATE TABLE manual_entity_overrides (
    entity_type VARCHAR, source_id VARCHAR, external_id VARCHAR, entity_id VARCHAR NOT NULL,
    note VARCHAR, created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (entity_type, source_id, external_id)
);
CREATE TABLE unresolved_entities (
    entity_type VARCHAR, source_id VARCHAR, external_id VARCHAR, source_name VARCHAR,
    context VARCHAR, best_candidate VARCHAR, best_score DOUBLE, reason VARCHAR,
    last_seen TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (entity_type, source_id, external_id)
);

-- Football data
CREATE TABLE fixtures (
    fixture_id VARCHAR PRIMARY KEY, competition_id VARCHAR DEFAULT 'PL', season_id VARCHAR NOT NULL,
    matchday INTEGER, match_date DATE, kickoff_utc TIMESTAMPTZ,
    home_team_id VARCHAR NOT NULL, away_team_id VARCHAR NOT NULL,
    status VARCHAR NOT NULL, source_id VARCHAR, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE fixture_source_ids (
    source_id VARCHAR, external_id VARCHAR, fixture_id VARCHAR NOT NULL,
    PRIMARY KEY (source_id, external_id)
);
CREATE TABLE match_results (
    fixture_id VARCHAR, source_id VARCHAR, match_date DATE, home_goals INTEGER, away_goals INTEGER,
    ht_home_goals INTEGER, ht_away_goals INTEGER, result VARCHAR, referee VARCHAR,
    ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (fixture_id, source_id)
);
CREATE TABLE league_standings (
    season_id VARCHAR, team_id VARCHAR, source_id VARCHAR, snapshot_date DATE,
    position INTEGER, played INTEGER, won INTEGER, drawn INTEGER, lost INTEGER,
    goals_for INTEGER, goals_against INTEGER, goal_difference INTEGER, points INTEGER,
    ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (season_id, team_id, source_id, snapshot_date)
);
CREATE TABLE player_statistics (
    player_id VARCHAR, season_id VARCHAR, source_id VARCHAR, observation_date DATE,
    team_id VARCHAR, minutes DOUBLE, starts DOUBLE, goals DOUBLE, assists DOUBLE,
    xg DOUBLE, xa DOUBLE, xgc DOUBLE, tackles DOUBLE,
    cbi DOUBLE, recoveries DOUBLE, defensive_contribution DOUBLE, clean_sheets DOUBLE,
    goals_conceded DOUBLE, saves DOUBLE, yellow_cards DOUBLE, red_cards DOUBLE,
    bonus DOUBLE, bps DOUBLE, influence DOUBLE, creativity DOUBLE, threat DOUBLE,
    ict_index DOUBLE, fpl_price DOUBLE, ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (player_id, season_id, source_id, observation_date)
);
CREATE TABLE player_appearances (
    game_id VARCHAR, player_id VARCHAR, source_id VARCHAR, game_date DATE, tm_club_id VARCHAR,
    competition_id VARCHAR, minutes INTEGER, goals INTEGER, assists INTEGER,
    yellow_cards INTEGER, red_cards INTEGER, ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (game_id, player_id, source_id)
);
CREATE TABLE team_statistics (
    fixture_id VARCHAR, team_id VARCHAR, source_id VARCHAR, is_home BOOLEAN, xg DOUBLE,
    shots INTEGER, shots_on_target INTEGER, fouls INTEGER, corners INTEGER,
    yellow_cards INTEGER, red_cards INTEGER, ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (fixture_id, team_id, source_id)
);
CREATE TABLE player_market_values (
    player_id VARCHAR, valuation_date DATE, source_id VARCHAR, value_eur DOUBLE,
    club_name VARCHAR, tm_club_id VARCHAR, competition_id VARCHAR,
    ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (player_id, valuation_date, source_id)
);
CREATE TABLE player_transfers (
    player_id VARCHAR, transfer_date DATE, source_id VARCHAR, season_label VARCHAR,
    from_club VARCHAR, to_club VARCHAR, fee_eur DOUBLE, market_value_eur DOUBLE,
    ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (player_id, transfer_date, source_id, to_club)
);
CREATE TABLE injury_records (
    player_id VARCHAR, source_id VARCHAR, status VARCHAR, news VARCHAR, news_added TIMESTAMPTZ,
    chance_next_round INTEGER, first_observed_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (player_id, source_id, status, news)
);
CREATE TABLE bookmaker_odds (
    fixture_id VARCHAR, bookmaker VARCHAR, market VARCHAR, timing VARCHAR, source_id VARCHAR,
    home_odds DOUBLE, draw_odds DOUBLE, away_odds DOUBLE,
    implied_home DOUBLE, implied_draw DOUBLE, implied_away DOUBLE, overround DOUBLE,
    ingested_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (fixture_id, bookmaker, market, timing, source_id)
);

-- ML and simulation
CREATE TABLE feature_snapshots (
    feature_set VARCHAR, entity_id VARCHAR, as_of TIMESTAMPTZ, features VARCHAR,
    PRIMARY KEY (feature_set, entity_id, as_of)
);
CREATE TABLE model_registry (
    model_version VARCHAR PRIMARY KEY, model_type VARCHAR, algorithm VARCHAR,
    trained_at TIMESTAMPTZ, train_start DATE, train_end DATE, test_start DATE, test_end DATE,
    n_train INTEGER, n_test INTEGER, artifact_path VARCHAR, params VARCHAR,
    is_active BOOLEAN DEFAULT FALSE, notes VARCHAR
);
CREATE TABLE model_metrics (
    model_version VARCHAR, scope VARCHAR, candidate VARCHAR, metric VARCHAR, value DOUBLE,
    recorded_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (model_version, scope, candidate, metric)
);
CREATE TABLE model_reports (
    model_version VARCHAR, report VARCHAR, payload VARCHAR,
    PRIMARY KEY (model_version, report)
);
CREATE TABLE match_predictions (
    fixture_id VARCHAR, model_version VARCHAR, predicted_at TIMESTAMPTZ, data_timestamp TIMESTAMPTZ,
    p_home DOUBLE, p_draw DOUBLE, p_away DOUBLE, xg_home DOUBLE, xg_away DOUBLE,
    most_likely_score VARCHAR, score_matrix VARCHAR,
    PRIMARY KEY (fixture_id, model_version, predicted_at)
);
CREATE TABLE player_similarity_results (
    model_version VARCHAR, player_id VARCHAR, similar_player_id VARCHAR, rank INTEGER, score DOUBLE,
    PRIMARY KEY (model_version, player_id, similar_player_id)
);
CREATE TABLE player_profiles (
    model_version VARCHAR, player_id VARCHAR, position_group VARCHAR, role VARCHAR,
    minutes DOUBLE, per90 VARCHAR, percentiles VARCHAR,
    PRIMARY KEY (model_version, player_id)
);
CREATE TABLE transfer_predictions (
    model_version VARCHAR, player_id VARCHAR, valuation_date DATE, actual_eur DOUBLE,
    predicted_eur DOUBLE, low_eur DOUBLE, high_eur DOUBLE, predicted_at TIMESTAMPTZ,
    PRIMARY KEY (model_version, player_id)
);
CREATE TABLE simulation_runs (
    simulation_id VARCHAR PRIMARY KEY, created_at TIMESTAMPTZ, iterations INTEGER, seed BIGINT,
    model_version VARCHAR, season_id VARCHAR, fixtures_remaining INTEGER, params VARCHAR
);
CREATE TABLE simulation_results (
    simulation_id VARCHAR, team_id VARCHAR, current_points INTEGER, expected_points DOUBLE,
    expected_position DOUBLE, p_title DOUBLE, p_top4 DOUBLE, p_top6 DOUBLE, p_relegation DOUBLE,
    points_p10 DOUBLE, points_p90 DOUBLE, position_distribution VARCHAR,
    PRIMARY KEY (simulation_id, team_id)
);
CREATE TABLE what_if_scenarios (
    scenario_id VARCHAR PRIMARY KEY, created_at TIMESTAMPTZ, payload VARCHAR
);

-- Data engineering
CREATE TABLE source_registry (
    source_id VARCHAR PRIMARY KEY, name VARCHAR, description VARCHAR, requires_key BOOLEAN,
    ttl_seconds BIGINT, stale_after_seconds BIGINT, last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ, last_attempt_ok BOOLEAN, last_error VARCHAR, records BIGINT,
    coverage VARCHAR, upstream_updated_at TIMESTAMPTZ, data_as_of DATE, snapshot_hash VARCHAR
);
CREATE TABLE ingestion_runs (
    run_id VARCHAR PRIMARY KEY, source_id VARCHAR, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
    status VARCHAR, from_cache BOOLEAN, records BIGINT, error VARCHAR
);
CREATE TABLE ingestion_errors (
    run_id VARCHAR, source_id VARCHAR, occurred_at TIMESTAMPTZ DEFAULT now(), stage VARCHAR,
    message VARCHAR
);
CREATE TABLE data_quality_checks (
    run_id VARCHAR, source_id VARCHAR, check_name VARCHAR, passed BOOLEAN, detail VARCHAR,
    checked_at TIMESTAMPTZ DEFAULT now()
);

-- Best available score per fixture, one row each.
CREATE VIEW v_match_results AS
SELECT * FROM match_results
QUALIFY row_number() OVER (
    PARTITION BY fixture_id
    ORDER BY CASE source_id WHEN 'football_data_org' THEN 0 WHEN 'fpl' THEN 1 ELSE 2 END
) = 1;
