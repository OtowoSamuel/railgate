# Antigravity Mini-PaaS

A lightweight PaaS deployment platform built with Node.js, Docker, and Caddy.

## Features
- **Git & Upload Deployments**: Deploy apps via Git URL or local zip/tarball.
- **Dynamic Routing**: Automatic path-based routing via Caddy JSON API (`/deploy/:id`).
- **Real-time Logs**: Build and deploy logs streamed via SSE.
- **No Dockerfiles needed**: Powered by Railpack buildpacks.
- **Premium UI**: Modern dark-mode dashboard with TanStack Query and Router.

## Tech Stack
- **Frontend**: Vite, React, TanStack Query, TanStack Router, Lucide Icons.
- **Backend**: Node.js, TypeScript, Express, better-sqlite3.
- **Orchestration**: Docker, docker-compose, Caddy.
- **Build System**: Railpack CLI.

## Quick Start
1. Ensure Docker and Docker Compose are installed.
2. Clone this repository.
3. Run the entire stack:
   ```bash
   docker-compose up --build
   ```
4. Access the dashboard at `http://localhost`.

## Architecture Decisions
- **Caddy Admin API**: Used for dynamic configuration of the reverse proxy without restarts.
- **Docker Socket Mount**: The backend interacts directly with the host Docker daemon to build images and run containers.
- **SQLite WAL Mode**: Ensures robust concurrent access for metadata and log storage.
- **SSE (Server-Sent Events)**: Chosen over WebSockets for efficient unidirectional log streaming with automatic reconnection.

## Future Improvements
- **Auth**: Add user accounts and RBAC.
- **Subdomains**: Support custom subdomains instead of just path-based routing.
- **Resource Limits**: Implement CPU/Memory limits for deployed containers.
- **Webhooks**: Auto-deploy on GitHub push.
