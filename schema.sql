-- OpenHub Store Database Schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Repositories Table
CREATE TABLE IF NOT EXISTS repos (
  id                  BIGINT PRIMARY KEY,
  owner               VARCHAR(255)  NOT NULL,
  name                VARCHAR(255)  NOT NULL,
  full_name           VARCHAR(511)  NOT NULL UNIQUE,
  description         TEXT          DEFAULT '',
  primary_language    VARCHAR(100)  DEFAULT 'Unknown',
  stars               INTEGER       DEFAULT 0,
  forks               INTEGER       DEFAULT 0,
  open_issues         INTEGER       DEFAULT 0,
  watchers            INTEGER       DEFAULT 0,
  license_spdx        VARCHAR(50)   DEFAULT 'Unknown',
  homepage            TEXT,
  topics              TEXT[]        DEFAULT '{}',
  default_branch      VARCHAR(100)  DEFAULT 'main',
  is_archived         BOOLEAN       DEFAULT FALSE,
  is_fork             BOOLEAN       DEFAULT FALSE,
  owner_type          VARCHAR(20),                    -- 'User' | 'Organization'
  owner_created_at    TIMESTAMP,
  owner_repo_count    INTEGER       DEFAULT 0,
  created_at          TIMESTAMP,
  last_pushed_at      TIMESTAMP,
  last_commit_at      TIMESTAMP,
  contributor_count   INTEGER       DEFAULT 0,
  -- Computed during enrichment
  platforms           TEXT[]        DEFAULT '{}',     -- ['windows','macos','linux']
  category            VARCHAR(100)  DEFAULT 'uncategorised',
  readme_html         TEXT,
  readme_cached_at    TIMESTAMP,
  -- Metadata
  is_listed           BOOLEAN       DEFAULT TRUE,
  is_featured         BOOLEAN       DEFAULT FALSE,
  cached_at           TIMESTAMP     DEFAULT NOW(),
  indexed_at          TIMESTAMP     DEFAULT NOW()
);

-- Processing Queue Table
CREATE TABLE IF NOT EXISTS repo_queue (
  id            SERIAL        PRIMARY KEY,
  full_name     VARCHAR(511)  NOT NULL UNIQUE,
  source        VARCHAR(50)   NOT NULL,   -- 'cron_discovery' | 'manual' | 'community_submit'
  priority      INTEGER       DEFAULT 5,  -- 1 = highest, 10 = lowest
  status        VARCHAR(20)   DEFAULT 'pending', -- pending | processing | done | failed | dead
  attempts      INTEGER       DEFAULT 0,
  error         TEXT,
  queued_at     TIMESTAMP     DEFAULT NOW(),
  processed_at  TIMESTAMP
);

-- Detection Signals Table
CREATE TABLE IF NOT EXISTS detection_signals (
  repo_id             BIGINT        PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
  framework_detected  VARCHAR(100),
  framework_score     INTEGER       DEFAULT 0,  -- 0–40
  manifest_score      INTEGER       DEFAULT 0,  -- 0–25
  topic_score         INTEGER       DEFAULT 0,  -- 0–15
  release_score       INTEGER       DEFAULT 0,  -- 0–15
  pkgmgr_score        INTEGER       DEFAULT 0,  -- 0–5
  total_score         INTEGER       DEFAULT 0,  -- ≥ 40 to list
  signals_detail      JSONB,                    -- per-signal evidence
  detected_at         TIMESTAMP     DEFAULT NOW()
);

-- Trust Scores Table
CREATE TABLE IF NOT EXISTS trust_scores (
  repo_id             BIGINT        PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
  account_trust       INTEGER       DEFAULT 0,  -- 0–30
  repo_signals        INTEGER       DEFAULT 0,  -- 0–30
  activity_signals    INTEGER       DEFAULT 0,  -- 0–20
  community_signals   INTEGER       DEFAULT 0,  -- 0–20
  total_score         INTEGER       DEFAULT 0,  -- ≥ 50 to surface
  anomaly_flagged     BOOLEAN       DEFAULT FALSE,
  anomaly_reason      TEXT,
  calculated_at       TIMESTAMP     DEFAULT NOW()
);

-- Repo History Table
CREATE TABLE IF NOT EXISTS repo_history (
  repo_id       BIGINT  REFERENCES repos(id) ON DELETE CASCADE,
  recorded_date DATE    NOT NULL,
  stars         INTEGER NOT NULL,
  forks         INTEGER NOT NULL,
  PRIMARY KEY (repo_id, recorded_date)
);

-- Trending Scores Table
CREATE TABLE IF NOT EXISTS trending_scores (
  repo_id           BIGINT          PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
  velocity_score    DECIMAL(10,6)   DEFAULT 0,
  momentum_score    DECIMAL(10,6)   DEFAULT 0,
  activity_score    DECIMAL(10,6)   DEFAULT 0,
  freshness_score   DECIMAL(10,6)   DEFAULT 0,
  base_score_norm   DECIMAL(10,6)   DEFAULT 0,
  trending_score    DECIMAL(10,6)   DEFAULT 0,
  trending_tier     VARCHAR(20),    -- 'rising' | 'hot' | 'established' | NULL
  history_days      INTEGER         DEFAULT 0,
  calculated_at     TIMESTAMP       DEFAULT NOW()
);

-- Releases Table
CREATE TABLE IF NOT EXISTS releases (
  id              BIGINT        PRIMARY KEY,  -- GitHub release ID
  repo_id         BIGINT        REFERENCES repos(id) ON DELETE CASCADE,
  tag_name        VARCHAR(100),
  name            TEXT,
  body            TEXT,                        -- sanitised release notes
  published_at    TIMESTAMP,
  is_prerelease   BOOLEAN       DEFAULT FALSE,
  is_draft        BOOLEAN       DEFAULT FALSE
);

-- Release Assets Table
CREATE TABLE IF NOT EXISTS release_assets (
  id              BIGINT        PRIMARY KEY,  -- GitHub asset ID
  release_id      BIGINT        REFERENCES releases(id) ON DELETE CASCADE,
  repo_id         BIGINT        REFERENCES repos(id) ON DELETE CASCADE,
  name            VARCHAR(500),
  size            BIGINT,                      -- bytes
  download_url    TEXT,
  content_type    VARCHAR(100),
  download_count  INTEGER       DEFAULT 0,
  asset_type      VARCHAR(20),                 -- 'binary' | 'archive' | 'source' | 'other'
  platform        VARCHAR(20),                 -- 'windows' | 'macos' | 'linux' | 'cross' | 'unknown'
  zip_confidence  VARCHAR(20),                 -- 'high' | 'low' | 'excluded' (for .zip only)
  cached_at       TIMESTAMP     DEFAULT NOW()
);

-- Icon Cache Table
CREATE TABLE IF NOT EXISTS icon_cache (
  repo_id         BIGINT        PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
  icon_url        TEXT          NOT NULL,
  source_level    INTEGER,      -- 1=root, 2=assets/, 3=framework-specific, 4=pattern match, 5=avatar
  last_verified   TIMESTAMP     DEFAULT NOW(),
  broken          BOOLEAN       DEFAULT FALSE
);

-- Repo Flags Table
CREATE TABLE IF NOT EXISTS repo_flags (
  id            SERIAL        PRIMARY KEY,
  repo_id       BIGINT        REFERENCES repos(id) ON DELETE CASCADE,
  session_hash  VARCHAR(64)   NOT NULL,  -- hashed, never raw
  reason        VARCHAR(100),
  created_at    TIMESTAMP     DEFAULT NOW(),
  UNIQUE (repo_id, session_hash)
);

-- Search Cache Table
CREATE TABLE IF NOT EXISTS search_cache (
  cache_key   VARCHAR(512)  PRIMARY KEY,  -- SHA256 of normalised query + filters
  results     JSONB         NOT NULL,
  repo_count  INTEGER,
  hit_count   INTEGER       DEFAULT 0,
  last_hit    TIMESTAMP,
  cached_at   TIMESTAMP     DEFAULT NOW(),
  expires_at  TIMESTAMP     NOT NULL
);

-- Rate Limit State Table
CREATE TABLE IF NOT EXISTS rate_limit_state (
  id            INTEGER   PRIMARY KEY DEFAULT 1,  -- always row 1
  remaining     INTEGER   NOT NULL,
  reset_at      TIMESTAMP NOT NULL,
  last_checked  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Initial Rate Limit State
INSERT INTO rate_limit_state (id, remaining, reset_at)
VALUES (1, 5000, NOW() + INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- Admin Log Table
CREATE TABLE IF NOT EXISTS admin_log (
  id            SERIAL      PRIMARY KEY,
  action        VARCHAR(100) NOT NULL,
  repo_id       BIGINT,
  detail        JSONB,
  performed_at  TIMESTAMP   DEFAULT NOW()
);

-- Helper Function for Admin Queue Stats
CREATE OR REPLACE FUNCTION get_queue_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_object_agg(status, count)
  INTO result
  FROM (
    SELECT status, count(*) as count
    FROM repo_queue
    GROUP BY status
  ) s;
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Indexes for Hot Query Paths
CREATE INDEX IF NOT EXISTS idx_repos_is_listed       ON repos(is_listed) WHERE is_listed = TRUE;
CREATE INDEX IF NOT EXISTS idx_repos_stars           ON repos(stars DESC);
CREATE INDEX IF NOT EXISTS idx_repos_indexed_at      ON repos(indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_repos_category        ON repos(category);
CREATE INDEX IF NOT EXISTS idx_repos_full_name       ON repos(full_name);
CREATE INDEX IF NOT EXISTS idx_repos_topics          ON repos USING GIN(topics);
CREATE INDEX IF NOT EXISTS idx_repos_platforms       ON repos USING GIN(platforms);
CREATE INDEX IF NOT EXISTS idx_repos_is_featured     ON repos(is_featured) WHERE is_featured = TRUE;

-- Indexes for Pipeline Paths
CREATE INDEX IF NOT EXISTS idx_queue_status          ON repo_queue(status, priority, queued_at);
CREATE INDEX IF NOT EXISTS idx_detection_score       ON detection_signals(total_score);
CREATE INDEX IF NOT EXISTS idx_trust_score           ON trust_scores(total_score);
CREATE INDEX IF NOT EXISTS idx_trending_score        ON trending_scores(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_tier         ON trending_scores(trending_tier);
CREATE INDEX IF NOT EXISTS idx_history_date          ON repo_history(recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_history_repo_date     ON repo_history(repo_id, recorded_date DESC);

-- Indexes for Asset Queries
CREATE INDEX IF NOT EXISTS idx_releases_repo         ON releases(repo_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_repo           ON release_assets(repo_id);
CREATE INDEX IF NOT EXISTS idx_assets_type           ON release_assets(asset_type);

-- Indexes for Cache Management
CREATE INDEX IF NOT EXISTS idx_search_expires        ON search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_flags_repo            ON repo_flags(repo_id, created_at);
