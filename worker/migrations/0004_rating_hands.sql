-- hands counted toward placement, kept with the rating so a reset puts someone back in placement too
ALTER TABLE ratings ADD COLUMN hands INTEGER NOT NULL DEFAULT 0;
