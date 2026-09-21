CREATE TABLE rounds (
 id uuid PRIMARY KEY, date date UNIQUE NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closing','closed')), credit_sequence bigint NOT NULL DEFAULT 0,
 version bigint NOT NULL DEFAULT 0, current_leader_id uuid, result_revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, CHECK(ends_at>starts_at)
);
CREATE TABLE participant_sessions (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assets (
 id uuid PRIMARY KEY, storage_key text UNIQUE NOT NULL, session_id uuid NOT NULL REFERENCES participant_sessions,
 mime text NOT NULL, byte_size integer NOT NULL, width integer NOT NULL, height integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE participants (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES participant_sessions, round_id uuid NOT NULL REFERENCES rounds,
 name text NOT NULL, description text NOT NULL, url text NOT NULL, normalized_domain text NOT NULL,
 logo_asset_id uuid REFERENCES assets, moderation_status text NOT NULL CHECK(moderation_status IN ('pending','approved','rejected')),
 moderation_reason text, hidden boolean NOT NULL DEFAULT false, rules_version text NOT NULL,
 version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,round_id), UNIQUE(id,round_id)
);
CREATE TABLE payments (
 id uuid PRIMARY KEY, participant_id uuid NOT NULL, round_id uuid NOT NULL REFERENCES rounds,
 provider text NOT NULL CHECK(provider IN ('mock','btcpay')), provider_store_id text NOT NULL, provider_invoice_id text,
 amount_sats bigint NOT NULL CHECK(amount_sats>0), minimum_sats bigint NOT NULL, maximum_sats bigint NOT NULL,
 creation_status text NOT NULL DEFAULT 'creating' CHECK(creation_status IN ('creating','ready','creation_unknown','failed')),
 provider_status text, additional_status text, settlement_status text NOT NULL DEFAULT 'pending' CHECK(settlement_status IN ('pending','processing','settled','expired','invalid')),
 credit_status text NOT NULL DEFAULT 'uncredited' CHECK(credit_status IN ('uncredited','credited','review','excluded')),
 requested_expires_at timestamptz NOT NULL, expires_at timestamptz, provider_received_at timestamptz,
 verified_at timestamptz, credited_at timestamptz, credit_sequence bigint, rules_version text NOT NULL, rules_accepted_at timestamptz NOT NULL,
 last_checked_at timestamptz, next_retry_at timestamptz NOT NULL DEFAULT now(), retry_count integer NOT NULL DEFAULT 0,
 review_reason text, resolved_at timestamptz, resolution_reason text, bolt11 text, snapshot jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(participant_id,round_id) REFERENCES participants(id,round_id), UNIQUE(provider,provider_store_id,provider_invoice_id)
);
CREATE UNIQUE INDEX one_active_invoice ON payments(participant_id) WHERE creation_status IN ('creating','creation_unknown') OR (creation_status='ready' AND settlement_status IN ('pending','processing') AND credit_status='uncredited');
CREATE INDEX payments_retry ON payments(next_retry_at);
CREATE INDEX payments_round ON payments(round_id,credit_status);
CREATE INDEX payments_participant ON payments(participant_id);
CREATE INDEX participants_visibility ON participants(round_id,moderation_status,hidden);
CREATE TABLE provider_payment_evidence (
 id uuid PRIMARY KEY, payment_id uuid NOT NULL REFERENCES payments, provider text NOT NULL, store_id text NOT NULL,
 external_payment_id text NOT NULL, amount_sats bigint NOT NULL CHECK(amount_sats>=0), method text NOT NULL,
 received_at timestamptz NOT NULL, verified_at timestamptz NOT NULL, sanitized_snapshot jsonb NOT NULL,
 UNIQUE(provider,store_id,external_payment_id)
);
CREATE TABLE invoice_references (
 provider text NOT NULL, store_id text NOT NULL, invoice_id text NOT NULL, bid_id uuid REFERENCES payments,
 disposition text NOT NULL CHECK(disposition IN ('canonical','orphan','duplicate')), discovered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,store_id,invoice_id)
);
CREATE TABLE idempotency_requests (
 session_id uuid NOT NULL REFERENCES participant_sessions, scope text NOT NULL, key_hash text NOT NULL, request_hash text NOT NULL,
 payment_id uuid NOT NULL REFERENCES payments, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,scope,key_hash)
);
CREATE TABLE webhook_inbox (
 id uuid PRIMARY KEY, provider text NOT NULL, store_id text NOT NULL, delivery_id text NOT NULL, original_delivery_id text,
 invoice_id text NOT NULL, event_type text NOT NULL, body_hash text NOT NULL, sanitized_payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, attempt_count integer NOT NULL DEFAULT 0,
 next_retry_at timestamptz NOT NULL DEFAULT now(), error_code text, UNIQUE(provider,store_id,delivery_id)
);
CREATE INDEX inbox_pending ON webhook_inbox(next_retry_at) WHERE processed_at IS NULL;
CREATE TABLE participant_totals (
 participant_id uuid PRIMARY KEY REFERENCES participants, round_id uuid NOT NULL REFERENCES rounds,
 total_sats bigint NOT NULL DEFAULT 0 CHECK(total_sats>=0), total_reached_sequence bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE domain_events (
 id uuid PRIMARY KEY, unique_event_key text UNIQUE NOT NULL, round_id uuid REFERENCES rounds, participant_id uuid REFERENCES participants,
 payment_id uuid REFERENCES payments, type text NOT NULL, reason text NOT NULL, round_sequence bigint,
 occurred_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL DEFAULT '{}', exported_at timestamptz
);
CREATE INDEX events_round ON domain_events(round_id,round_sequence);
CREATE TABLE blocked_domains (
 id uuid PRIMARY KEY, normalized_domain text UNIQUE NOT NULL, include_subdomains boolean NOT NULL DEFAULT true,
 reason text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), disabled_at timestamptz
);
CREATE TABLE moderation_actions (
 id uuid PRIMARY KEY, participant_id uuid NOT NULL REFERENCES participants, admin_id text NOT NULL, action text NOT NULL,
 reason text NOT NULL, before_json jsonb NOT NULL, after_json jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_sessions (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, admin_identity text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (
 id uuid PRIMARY KEY, actor text NOT NULL, action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
 reason text NOT NULL, before_json jsonb, after_json jsonb, correlation_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit is append only'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
CREATE TABLE operational_settings (key text PRIMARY KEY, value jsonb NOT NULL, version integer NOT NULL DEFAULT 0, updated_by text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE job_leases (name text PRIMARY KEY, owner uuid NOT NULL, expires_at timestamptz NOT NULL, last_success_at timestamptz, cursor jsonb);
CREATE TABLE rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE mock_invoices (id text PRIMARY KEY, bid_id uuid UNIQUE NOT NULL REFERENCES payments, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE client_events (id uuid PRIMARY KEY, type text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
