import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import db from '../db';
import { startDeployment } from '../services/pipeline';
import { getLogs, logEmitter } from '../services/logs';

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
  startDeployment(id);

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

// GET /deployments/:id/logs - SSE stream
router.get('/:id/logs', (req, res) => {
  const { id } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send existing logs
  const existingLogs = getLogs(id);
  existingLogs.forEach((log: any) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  // Listen for new logs
  const onLog = (log: any) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  logEmitter.on(`log:${id}`, onLog);

  // Clean up on disconnect
  req.on('close', () => {
    logEmitter.removeListener(`log:${id}`, onLog);
  });
});

export default router;
