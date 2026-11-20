-- Who replaced whom (from the jegyzőkönyv). Stored on the substitute's appearance row.
-- Used for "substitution direction" position inference: coaches mostly change like for like.
ALTER TABLE match_appearances
    ADD COLUMN IF NOT EXISTS replaced_player_id UUID REFERENCES players(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appearances_replaced ON match_appearances(replaced_player_id)
    WHERE replaced_player_id IS NOT NULL;
