import { ulid } from 'ulid';
import db from '../db';
import { addLog } from './logs';
import { buildImage, runContainer, waitForAppReadiness, destroyContainerGracefully, runCommand } from './docker';
import { caddyManager } from './caddy';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

export async function startDeployment(deploymentId: string, buildSource: 'git' | 'upload' | 'rollback', targetBuildId?: string) {
  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as any;
  if (!deployment) return;

  const buildId = ulid();
  let imageTag = '';

  try {
    // 1. Build Phase
    if (buildSource === 'rollback' && targetBuildId) {
      const targetBuild = db.prepare('SELECT * FROM builds WHERE id = ?').get(targetBuildId) as any;
      if (!targetBuild) throw new Error('Target build not found for rollback');
      
      imageTag = targetBuild.image_tag;
      
      const buildStmt = db.prepare('INSERT INTO builds (id, deployment_id, image_tag, status, source, parent_build_id) VALUES (?, ?, ?, ?, ?, ?)');
      buildStmt.run(buildId, deploymentId, imageTag, 'succeeded', 'rollback', targetBuildId);
      
      updateStatus(deploymentId, 'deploying');
      addLog(deploymentId, 'deploy', `Rolling back to image ${imageTag}...`);
    } else {
      imageTag = `deploy-${deploymentId}:${buildId.toLowerCase()}`;
      const buildStmt = db.prepare('INSERT INTO builds (id, deployment_id, image_tag, status, source) VALUES (?, ?, ?, ?, ?)');
      buildStmt.run(buildId, deploymentId, imageTag, 'building', buildSource);

      updateStatus(deploymentId, 'building');
      addLog(deploymentId, 'build', `Starting build pipeline (ID: ${buildId})...`);

      const workdir = await mkdtemp(path.join(tmpdir(), 'railgate-build-'));
      addLog(deploymentId, 'build', `Created build workspace: ${workdir}`);

      try {
        if (buildSource === 'git') {
          addLog(deploymentId, 'build', `Cloning repository ${deployment.source_value}...`);
          await runCommand('git', ['clone', '--depth', '1', deployment.source_value, workdir], deploymentId, 'build');
        } else if (buildSource === 'upload') {
          addLog(deploymentId, 'build', `Extracting archive ${deployment.source_value}...`);
          await runCommand('unzip', ['-o', deployment.source_value, '-d', workdir], deploymentId, 'build');
        }

        await buildImage(deploymentId, workdir, imageTag);

        db.prepare('UPDATE builds SET status = ? WHERE id = ?').run('succeeded', buildId);
        addLog(deploymentId, 'build', 'Build succeeded.');
      } finally {
        // Clean up the temporary workspace
        await rm(workdir, { recursive: true, force: true }).catch(err => console.error('Failed to cleanup workdir:', err));
      }
      
      updateStatus(deploymentId, 'deploying');
    }

    // 2. Deploy Phase (Zero-Downtime)
    const containerName = `app-${deploymentId}-${buildId.slice(-6).toLowerCase()}`;
    addLog(deploymentId, 'deploy', `Starting new container ${containerName}...`);

    const { containerId, port } = await runContainer(deploymentId, imageTag, containerName);
    addLog(deploymentId, 'deploy', `Container started. ID: ${containerId}. Waiting for readiness...`);

    await waitForAppReadiness(deploymentId, containerName, port);

    await caddyManager.addOrUpdateRoute(deploymentId, `${containerName}:3000`);

    // 3. Cleanup Old Container
    const previousContainerId = deployment.container_id;
    if (previousContainerId && previousContainerId !== containerId) {
      addLog(deploymentId, 'deploy', `Gracefully shutting down old container ${previousContainerId}...`);
      await destroyContainerGracefully(previousContainerId);
    }

    const liveUrl = `/apps/${deploymentId}/`;
    updateStatus(deploymentId, 'running', { 
      container_id: containerId, 
      container_port: port, 
      image_tag: imageTag, 
      active_build_id: buildId,
      live_url: liveUrl 
    });

    addLog(deploymentId, 'deploy', `Deployment successful! Live at: ${liveUrl}`);

  } catch (error: any) {
    console.error(`Deployment ${deploymentId} failed:`, error);
    updateStatus(deploymentId, 'failed', { error_message: error.message });
    db.prepare('UPDATE builds SET status = ? WHERE id = ?').run('failed', buildId);
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
