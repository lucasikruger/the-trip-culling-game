-- ──────────────────────────────────────────────────────────────────────────────
-- THE TRIP CULLING GAME — Database Schema
-- Run once in the Supabase SQL Editor before first deploy.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Participants ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS participants (
  email                                   TEXT PRIMARY KEY,
  is_admin                                BOOLEAN      NOT NULL DEFAULT FALSE,
  is_super_admin                          BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active                               BOOLEAN      NOT NULL DEFAULT TRUE,
  login_code                              TEXT,
  code_expires_at                         TIMESTAMPTZ,
  session_token                           TEXT,
  session_expires_at                      TIMESTAMPTZ,
  display_name                            TEXT,
  avatar_url                              TEXT,
  email_notifications_enabled             BOOLEAN      NOT NULL DEFAULT TRUE,
  current_vote_bonus_points               INTEGER      NOT NULL DEFAULT 0,
  current_vote_bonus_profile_photo_points INTEGER      NOT NULL DEFAULT 0,
  current_vote_bonus_submission_points    INTEGER      NOT NULL DEFAULT 0
);

-- ── Destinations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS destinations (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT         NOT NULL,
  name_normalized  TEXT         NOT NULL,   -- lowercase, no spaces (used for uniqueness)
  description      TEXT,
  photo_url        TEXT,                    -- kept for backwards compat; primary source is photos[]
  photos           JSONB        NOT NULL DEFAULT '[]'::JSONB,
  created_by       TEXT         REFERENCES participants(email),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_removed       BOOLEAN      NOT NULL DEFAULT FALSE,
  removal_reason   TEXT,
  removed_at       TIMESTAMPTZ,
  removed_by       TEXT         REFERENCES participants(email),
  is_example       BOOLEAN      NOT NULL DEFAULT FALSE,
  is_in_draw       BOOLEAN      NOT NULL DEFAULT FALSE
);

-- No two active non-example destinations can share a normalized name
CREATE UNIQUE INDEX IF NOT EXISTS destinations_name_normalized_unique
  ON destinations(name_normalized)
  WHERE is_removed = FALSE;

-- Each participant can have at most one active non-example destination
CREATE UNIQUE INDEX IF NOT EXISTS destinations_one_per_creator
  ON destinations(created_by)
  WHERE is_removed = FALSE AND is_example = FALSE AND created_by IS NOT NULL;

-- ── Votes ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS votes (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_email TEXT         NOT NULL REFERENCES participants(email),
  destination_id    UUID         NOT NULL REFERENCES destinations(id),
  points            INTEGER      NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- A participant can only cast each point value once per round
CREATE UNIQUE INDEX IF NOT EXISTS votes_participant_points_unique
  ON votes(participant_email, points);

-- A participant can only vote for each destination once
CREATE UNIQUE INDEX IF NOT EXISTS votes_participant_destination_unique
  ON votes(participant_email, destination_id);

-- ── Settings ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  id                          INTEGER  PRIMARY KEY DEFAULT 1,
  submission_deadline         TIMESTAMPTZ,
  voting_deadline             TIMESTAMPTZ,
  draw_deadline               TIMESTAMPTZ,
  draw_duration_hours         INTEGER  NOT NULL DEFAULT 24,
  draw_duration_minutes       INTEGER  NOT NULL DEFAULT 1440,
  vote_point_options          JSONB    NOT NULL DEFAULT '[10, 50, 100]'::JSONB,
  bonus_profile_photo_enabled BOOLEAN  NOT NULL DEFAULT FALSE,
  bonus_profile_photo_points  INTEGER  NOT NULL DEFAULT 1,
  bonus_submission_enabled    BOOLEAN  NOT NULL DEFAULT FALSE,
  bonus_submission_points     INTEGER  NOT NULL DEFAULT 1,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO settings (id, submission_deadline, voting_deadline)
VALUES (1, NOW() + INTERVAL '7 days', NOW() + INTERVAL '14 days')
ON CONFLICT (id) DO NOTHING;

