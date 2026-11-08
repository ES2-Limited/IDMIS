ALTER TABLE core.import_batch ADD COLUMN IF NOT EXISTS rbda_id uuid REFERENCES core.organisation(id);
CREATE INDEX IF NOT EXISTS import_batch_rbda_id_idx ON core.import_batch (rbda_id);
