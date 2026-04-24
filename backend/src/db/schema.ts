export const schema = `
CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL, -- 'git' or 'upload'
  source_value TEXT NOT NULL, -- git url or file path
  status TEXT NOT NULL, -- 'pending', 'building', 'deploying', 'running', 'failed'
  image_tag TEXT,
  container_id TEXT,
  container_port INTEGER,
  live_url TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL,
  stage TEXT NOT NULL, -- 'build' or 'deploy'
  line TEXT NOT NULL,
  emitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id)
);
`;
