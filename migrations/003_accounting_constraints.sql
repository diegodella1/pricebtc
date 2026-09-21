ALTER TABLE payments ADD CONSTRAINT credited_payment_complete CHECK (
 credit_status <> 'credited' OR (settlement_status='settled' AND credited_at IS NOT NULL AND credit_sequence IS NOT NULL)
);
ALTER TABLE payments ADD CONSTRAINT accepted_amount_limits CHECK (
 minimum_sats>0 AND maximum_sats>=minimum_sats AND amount_sats BETWEEN minimum_sats AND maximum_sats
);
CREATE UNIQUE INDEX credit_sequence_unique ON payments(round_id,credit_sequence) WHERE credit_sequence IS NOT NULL;
ALTER TABLE participants ADD CONSTRAINT profile_lengths CHECK (
 char_length(name) BETWEEN 1 AND 40 AND char_length(description) BETWEEN 1 AND 100 AND char_length(url)<=2048
);
