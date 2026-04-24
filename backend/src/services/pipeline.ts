import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { addLog } from './logs';
import { buildImage, runContainer } from './docker';
import { addRoute } from './caddy';

export async function startDeployment(deploymentId: string) {
  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as any;
  if (!deployment) return;

  try {
    updateStatus(deploymentId, 'building');
    addLog(deploymentId, 'build', 'Starting build pipeline...');

    const tag = `deploy-${deploymentId}-${Date.now().toString().slice(-6)}`;
    let sourcePath = deployment.source_value;

    // In a real app, we'd clone git repo here if source_type is 'git'
    if (deployment.source_type === 'git') {
      addLog(deploymentId, 'build', `Cloning git repository: ${deployment.source_value}`);
      // Simulating clone for now
      // await runCommand('git', ['clone', deployment.source_value, tempDir], deploymentId, 'build');
    }

    await buildImage(deploymentId, sourcePath, tag);

    updateStatus(deploymentId, 'deploying');
    addLog(deploymentId, 'deploy', 'Deploying container...');

    const { containerId, port } = await runContainer(deploymentId, tag);

    addLog(deploymentId, 'deploy', `Container started. ID: ${containerId}, Port: ${port}`);

    updateStatus(deploymentId, 'deploying', { container_id: containerId, container_port: port, image_tag: tag });

    addLog(deploymentId, 'deploy', 'Configuring routing...');
    await addRoute(deploymentId, port);

    const liveUrl = `/deploy/${deploymentId}`;
    updateStatus(deploymentId, 'running', { live_url: liveUrl });
    addLog(deploymentId, 'deploy', `Deployment successful! Live at: ${liveUrl}`);

  } catch (error: any) {
    console.error(`Deployment ${deploymentId} failed:`, error);
    updateStatus(deploymentId, 'failed', { error_message: error.message });
    addLog(deploymentId, 'deploy', `ERROR: ${error.message}`);
  }
}

function updateStatus(id: string, status: string, extras: any = {}) {
  const sets = Object.keys(extras).map(k => `${k} = ?`).join(', ');
  const values = Object.values(extras);

  if (sets) {
    const stmt = db.prepare(`UPDATE deployments SET status = ?, ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run(status, ...values, id);
  } else {
    const stmt = db.prepare('UPDATE deployments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(status, id);
  }
}
