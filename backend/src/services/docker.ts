import { spawn } from 'child_process';
import { addLog } from './logs';

export function runCommand(command: string, args: string[], deploymentId: string, stage: 'build' | 'deploy'): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let output = '';

    process.stdout.on('data', (data) => {
      const line = data.toString();
      output += line;
      addLog(deploymentId, stage, line);
    });

    process.stderr.on('data', (data) => {
      const line = data.toString();
      addLog(deploymentId, stage, line);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command ${command} failed with code ${code}`));
      }
    });
  });
}

export async function buildImage(deploymentId: string, sourcePath: string, tag: string) {
  // Railpack build
  // Usage: railpack build <source> -t <tag>
  await runCommand('npx', ['-y', 'railpack', 'build', sourcePath, '-t', tag], deploymentId, 'build');
}

export async function runContainer(deploymentId: string, tag: string): Promise<{ containerId: string; port: number }> {
  // docker run -d -P --name <name> <tag>
  // -P publishes all exposed ports to random ports
  const output = await runCommand('docker', ['run', '-d', '-P', '--name', `deploy-${deploymentId}`, tag], deploymentId, 'deploy');
  const containerId = output.trim();

  // Get the assigned port
  // docker port <id>
  const portOutput = await runCommand('docker', ['port', containerId], deploymentId, 'deploy');
  // Format: 3000/tcp -> 0.0.0.0:49153
  const match = portOutput.match(/:(\d+)/);
  const port = match ? parseInt(match[1], 10) : 0;

  if (!port) {
    throw new Error('Could not determine container port');
  }

  return { containerId, port };
}
