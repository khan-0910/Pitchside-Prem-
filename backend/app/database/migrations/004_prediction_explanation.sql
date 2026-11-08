-- The steps behind each prediction. Only the newest row per fixture keeps them.
ALTER TABLE match_predictions ADD COLUMN explanation VARCHAR;
