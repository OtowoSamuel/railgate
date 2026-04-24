import { EventEmitter } from 'events';
import { ulid } from 'ulid';
import db from '../db';

export const logEmitter = new EventEmitter();

export function addLog(deploymentId: string, stage: 'build' | 'deploy', line: string) {
  const id = ulid();
  const stmt = db.prepare('INSERT INTO deployment_logs (id, deployment_id, stage, line) VALUES (?, ?, ?, ?)');
  stmt.run(id, deploymentId, stage, line);

  const logEvent = {
    id,
    stage,
    line,
    emitted_at: new Date().toISOString()
  };

  logEmitter.emit(`log:${deploymentId}`, logEvent);
}

export function getLogs(deploymentId: string) {
  const stmt = db.prepare('SELECT id, stage, line, emitted_at FROM deployment_logs WHERE deployment_id = ? ORDER BY id ASC');
  return stmt.all(deploymentId);
}

export function getLogsAfter(deploymentId: string, afterId: string) {
  const stmt = db.prepare('SELECT id, stage, line, emitted_at FROM deployment_logs WHERE deployment_id = ? AND id > ? ORDER BY id ASC');
  return stmt.all(deploymentId, afterId);
}
