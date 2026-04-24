import axios from 'axios';
import { Mutex } from 'async-mutex';

const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL || 'http://caddy:2019';

class CaddyManager {
  private mutex = new Mutex();

  async addOrUpdateRoute(deploymentId: string, upstreamHost: string) {
    return await this.mutex.runExclusive(async () => {
      const routeId = `deploy-${deploymentId}`;
      const routePayload = {
        '@id': routeId,
        handle: [
          {
            handler: 'reverse_proxy',
            upstreams: [{ dial: upstreamHost }]
          }
        ],
        match: [{ path: [`/deploy/${deploymentId}/*`] }],
        terminal: true
      };

      try {
        // Caddy's POST to /config/... appends. But we want to UPDATE or ADD.
        // The safest way with the Admin API using `@id` is to PATCH the route if it exists, or POST if it doesn't.
        // Actually, Caddy allows PUT to /id/<id> to update/create a specific block if the ID is known to exist.
        // Wait, Caddy's /id/<id> endpoint might not work if the ID isn't in the config yet.
        // Let's read the routes, filter out the old one, push the new one, and PATCH.
        
        const response = await axios.get(`${CADDY_ADMIN_URL}/config/apps/http/servers/srv0/routes`);
        let routes = response.data || [];
        
        // Remove existing route for this deployment if it exists
        routes = routes.filter((r: any) => r['@id'] !== routeId);
        
        // Add the new route at the beginning to take precedence over the catch-all
        routes.unshift(routePayload);

        await axios.patch(`${CADDY_ADMIN_URL}/config/apps/http/servers/srv0/routes`, routes);
        console.log(`Caddy route ${routeId} configured -> upstream ${upstreamHost}`);
      } catch (error: any) {
        console.error(`Failed to update Caddy: ${error.message}`);
        throw new Error(`Caddy update failed: ${error.message}`);
      }
    });
  }

  async removeRoute(deploymentId: string) {
    return await this.mutex.runExclusive(async () => {
      const routeId = `deploy-${deploymentId}`;
      try {
        // Try deleting by ID
        await axios.delete(`${CADDY_ADMIN_URL}/id/${routeId}`);
        console.log(`Caddy route ${routeId} removed`);
      } catch (error: any) {
        // If it's a 404, it means it doesn't exist, which is fine
        if (error.response && error.response.status === 404) {
          return;
        }
        console.error(`Failed to remove Caddy route: ${error.message}`);
      }
    });
  }
}

export const caddyManager = new CaddyManager();
