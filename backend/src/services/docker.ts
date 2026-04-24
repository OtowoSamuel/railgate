import Docker from 'dockerode';
import { spawn } from 'child_process';
import { addLog } from './logs';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const READINESS_TIMEOUT_MS = 60000;
const DOCKER_NETWORK = 'railgate_paas-network'; // compose default network name

export function runCommand(command: string, args: string[], deploymentId: string, stage: 'build' | 'deploy'): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let output = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      output += line;
      addLog(deploymentId, stage, line);
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      addLog(deploymentId, stage, line);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command ${command} failed with code ${code}`));
      }
    });
  });
}

export async function buildImage(deploymentId: string, sourcePath: string, tag: string) {
  // Use Railpack via npx
  await runCommand('npx', ['-y', 'railpack', 'build', sourcePath, '-t', tag], deploymentId, 'build');
}

export async function runContainer(deploymentId: string, tag: string, containerName: string): Promise<{ containerId: string; port: number }> {
  const container = await docker.createContainer({
    Image: tag,
    name: containerName,
    HostConfig: {
      NetworkMode: DOCKER_NETWORK,
      PublishAllPorts: true, // Equivalent to -P
      RestartPolicy: { Name: 'unless-stopped' }
    },
    Env: ['PORT=3000']
  });

  await container.start();
  const inspect = await container.inspect();
  
  // Extract assigned port mapping. We want the container port (e.g. 3000) inside the Docker network.
  // Wait, if it's in the same network as Caddy, Caddy can address it directly by containerName:3000.
  // Let's use the internal port directly if we are on the same network!
  // We'll expose 3000 and tell Caddy to route to containerName:3000
  const port = 3000; 

  return { containerId: container.id, port };
}

export async function waitForAppReadiness(deploymentId: string, host: string, port: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < READINESS_TIMEOUT_MS) {
    try {
      // In Node.js, we can use global fetch
      const res = await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) {
        addLog(deploymentId, 'deploy', `Readiness probe passed: http://${host}:${port}/`);
        return;
      }
      addLog(deploymentId, 'deploy', `Readiness probe returned status ${res.status}, retrying...`);
    } catch (e: any) {
      addLog(deploymentId, 'deploy', `Readiness probe failed (${e.message}), retrying...`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for readiness after ${READINESS_TIMEOUT_MS / 1000}s`);
}

export async function destroyContainerGracefully(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  try {
    await container.stop({ t: 10 });
  } catch (e) {
    // Ignore if already stopped
  }
  try {
    await container.remove({ force: true });
  } catch (e) {
    // Ignore if already removed
  }
}
