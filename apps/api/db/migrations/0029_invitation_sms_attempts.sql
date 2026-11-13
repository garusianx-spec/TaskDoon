-- Additive only: existing invitations and their tokens remain valid, with unknown SMS history.
ALTER TABLE invitations ADD COLUMN sms_attempts jsonb;
ALTER TABLE invitations ADD COLUMN sms_link_sealed text;
ALTER TABLE invitations ADD CONSTRAINT invitations_sms_attempts_array
  CHECK (sms_attempts IS NULL OR jsonb_typeof(sms_attempts) = 'array');
