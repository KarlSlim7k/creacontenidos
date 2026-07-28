-- Estado mínimo para integrar Telegram sin repetir decisiones ni perder una devolución escrita.
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id BIGINT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_review_notifications (
  chat_id BIGINT NOT NULL,
  proposal_id INTEGER NOT NULL REFERENCES content_proposals(id) ON DELETE CASCADE,
  notification_date DATE NOT NULL,
  message_id BIGINT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, proposal_id, notification_date)
);

CREATE TABLE IF NOT EXISTS telegram_pending_returns (
  chat_id BIGINT PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES content_proposals(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
