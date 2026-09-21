CREATE TABLE verification_requests (
 payment_id uuid PRIMARY KEY REFERENCES payments,
 requested_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
