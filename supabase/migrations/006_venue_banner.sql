ALTER TABLE venues ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS diamond_focal_x float DEFAULT 0.5;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS diamond_focal_y float DEFAULT 0.5;
