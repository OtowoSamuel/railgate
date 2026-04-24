export const schema = `
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL, -- 'git' or 'upload'
  source_value TEXT NOT NULL, -- git url or file path
  status TEXT NOT NULL, -- 'pending', 'building', 'deploying', 'running', 'failed', 'deleted'
  active_build_id TEXT,
  image_tag TEXT,
  container_id TEXT,
  container_port INTEGER,
  live_url TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  image_tag TEXT NOT NULL,
  status TEXT NOT NULL, -- 'building', 'succeeded', 'failed'
  source TEXT NOT NULL, -- 'git', 'upload', 'rollback'
  parent_build_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployment_logs (
  id TEXT PRIMARY KEY, -- ULID for cursoring
  deployment_id TEXT NOT NULL,
  stage TEXT NOT NULL, -- 'build' or 'deploy'
  line TEXT NOT NULL,
  emitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_deployment_id ON deployment_logs(deployment_id);
CREATE INDEX IF NOT EXISTS idx_builds_deployment_id ON builds(deployment_id);
`;
