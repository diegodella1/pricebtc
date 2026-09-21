ALTER TABLE domain_events ADD COLUMN export_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE domain_events ADD COLUMN export_next_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX events_pending_export ON domain_events(export_next_at,occurred_at) WHERE exported_at IS NULL;
