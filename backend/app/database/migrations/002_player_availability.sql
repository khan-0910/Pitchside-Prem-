-- Current availability, separate from the injury_records change log.
ALTER TABLE players ADD COLUMN availability VARCHAR;
ALTER TABLE players ADD COLUMN chance_next_round INTEGER;
