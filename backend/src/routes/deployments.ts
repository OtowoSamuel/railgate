import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import db from '../db';
import { startDeployment } from '../services/pipeline';
import { getLogs, getLogsAfter, logEmitter } from '../services/logs';
import { caddyManager } from '../services/caddy';
import { destroyContainerGracefully } from '../services/docker';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// POST /deployments - accepts Git URL or multipart file upload
router.post('/', upload.single('file'), async (req, res) => {
  const { gitUrl } = req.body;
  const file = req.file;

  if (!gitUrl && !file) {
    return res.status(400).json({ error: 'Git URL or file upload is required' });
  }

  const id = uuidv4();
  const sourceType = gitUrl ? 'git' : 'upload';
  const sourceValue = gitUrl || path.resolve(file!.path);

  const stmt = db.prepare('INSERT INTO deployments (id, source_type, source_value, status) VALUES (?, ?, ?, ?)');
  stmt.run(id, sourceType, sourceValue, 'pending');

  // Trigger pipeline asynchronously
  startDeployment(id, sourceType);

  res.json({ id, status: 'pending' });
});

// GET /deployments - list all deployments
router.get('/', (req, res) => {
  const deployments = db.prepare('SELECT * FROM deployments ORDER BY created_at DESC').all();
  res.json(deployments);
});

// GET /deployments/:id - single deployment detail
router.get('/:id', (req, res) => {
  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(req.params.id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
  res.json(deployment);
});

// GET /deployments/:id/builds - get builds for a deployment
router.get('/:id/builds', (req, res) => {
  const builds = db.prepare('SELECT * FROM builds WHERE deployment_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(builds);
});

// POST /deployments/:id/rollback - rollback to a specific build
router.post('/:id/rollback', (req, res) => {
  const { build_id } = req.body;
  if (!build_id) return res.status(400).json({ error: 'build_id is required' });

  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(req.params.id) as any;
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
  
  if (deployment.status === 'pending' || deployment.status === 'building' || deployment.status === 'deploying') {
    return res.status(409).json({ error: 'Deployment is currently in progress. Please wait.' });
  }

  startDeployment(req.params.id, 'rollback', build_id);

  res.status(202).json({ message: 'Rollback initiated' });
});

// GET /deployments/:id/logs - SSE stream
router.get('/:id/logs', (req, res) => {
  const { id } = req.params;
  const lastEventId = req.get('Last-Event-ID') || req.query.cursor as string;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send existing logs
  const existingLogs = lastEventId ? getLogsAfter(id, lastEventId) : getLogs(id);
  existingLogs.forEach((log: any) => {
    res.write(`id: ${log.id}\n`);
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  // Keepalive heartbeat
  const heartbeat = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 15000);

  // Listen for new logs
  const onLog = (log: any) => {
    res.write(`id: ${log.id}\n`);
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  logEmitter.on(`log:${id}`, onLog);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    logEmitter.removeListener(`log:${id}`, onLog);
  });
});

// DELETE /deployments/:id
router.delete('/:id', async (req, res) => {
  const deploymentId = req.params.id;
  const deployment = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId) as any;
  
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
  
  if (deployment.status === 'deleted') {
    return res.json({ message: 'Already deleted' });
  }

  // Terminate container if exists
  if (deployment.container_id) {
    try {
      await destroyContainerGracefully(deployment.container_id);
    } catch (e: any) {
      console.error(`Failed to destroy container: ${e.message}`);
    }
  }

  // Remove Caddy route
  await caddyManager.removeRoute(deploymentId);

  // Update DB
  db.prepare('UPDATE deployments SET status = ?, live_url = NULL, active_build_id = NULL WHERE id = ?').run('deleted', deploymentId);

  // Emit event so SSE clients know it's deleted
  const logEvent = {
    id: uuidv4(),
    stage: 'system',
    line: 'Deployment deleted',
    emitted_at: new Date().toISOString()
  };
  logEmitter.emit(`log:${deploymentId}`, logEvent);

  res.json({ message: 'Deployment deleted', status: 'deleted' });
});

export default router;
