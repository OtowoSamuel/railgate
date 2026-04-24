import { EventEmitter } from 'events';
import db from '../db';

export const logEmitter = new EventEmitter();

export function addLog(deploymentId: string, stage: 'build' | 'deploy', line: string) {
  const stmt = db.prepare('INSERT INTO deployment_logs (deployment_id, stage, line) VALUES (?, ?, ?)');
  stmt.run(deploymentId, stage, line);

  logEmitter.emit(`log:${deploymentId}`, {
    stage,
    line,
    emitted_at: new Date().toISOString()
  });
}

export function getLogs(deploymentId: string) {
  const stmt = db.prepare('SELECT stage, line, emitted_at FROM deployment_logs WHERE deployment_id = ? ORDER BY emitted_at ASC');
  return stmt.all(deploymentId);
}
