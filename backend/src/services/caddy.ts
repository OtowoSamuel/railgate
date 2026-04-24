import axios from 'axios';

const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL || 'http://localhost:2019';

export async function addRoute(deploymentId: string, port: number) {
  const route = {
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `host.docker.internal:${port}` }]
      }
    ],
    match: [{ path: [`/deploy/${deploymentId}/*`] }],
    terminal: true
  };

  try {
    // This is a simplified approach. Ideally, we should fetch existing routes and append/update.
    // For this mini-PaaS, we'll use a specific path in Caddy config.
    await axios.post(`${CADDY_ADMIN_URL}/config/apps/http/servers/srv0/routes`, route);
    console.log(`Caddy route added for deployment ${deploymentId} -> port ${port}`);
  } catch (error: any) {
    console.error(`Failed to update Caddy: ${error.message}`);
    throw new Error(`Caddy update failed: ${error.message}`);
  }
}

export async function removeRoute(deploymentId: string) {
  // Implementation for cleanup if needed
}
