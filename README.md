# Railgate: Mini PaaS Pipeline

Railgate is a zero-downtime deployment engine that takes either a Git repository URL or an uploaded project archive, automatically builds it into a container image using Railpack, runs it securely, and serves it dynamically behind Caddy.

This project was built to satisfy the Brimble Fullstack / Infra Engineer Take-Home assignment.

---

## Stack & Core Decisions

- **Frontend**: Vite + React 19 + TanStack Query (Single Page Application). 
  - *Decision:* Opted for a completely bespoke "Deep Space Glassmorphism" UI using **pure Vanilla CSS** (no Tailwind) to demonstrate advanced frontend engineering and deliver a premium, Vercel-like aesthetic.
- **API**: Node.js + TypeScript + Express.
- **Database**: **SQLite (WAL Mode)**.
  - *Decision:* Rather than spinning up a heavy Postgres container, I opted for SQLite in Write-Ahead Logging mode. For a single-node hyper-converged PaaS, SQLite is the modern standard (endorsed by Fly.io/Tailscale), providing instant `docker compose up` times while safely handling concurrent log streams.
- **Orchestration**: Docker Engine API (`dockerode`).
  - *Decision:* Instead of spawning brittle shell commands (`child_process.spawn('docker run...')`), the API communicates directly with the Docker socket via REST. This is the industry-standard pattern used by production orchestrators like Kubernetes and Portainer.
- **Ingress**: Caddy.
  - *Decision:* Caddy is the sole public ingress. The API dynamically injects routes via Caddy's Admin REST API, allowing zero-downtime route atomic patching without ever restarting the proxy process.
- **Build Engine**: Railpack + BuildKit.
  - *Decision:* The API container runs a dedicated `buildkit` daemon service to ensure rapid, cached container builds using Cloud Native Buildpacks (Railpack).

---

## Hard Requirements Coverage

- **Single command startup:** Fully containerized. `docker compose up --build -d` brings up the entire stack instantly.
- **Live log streaming over SSE:** Streams real-time build and deploy logs. Uses `ULID` (Universally Unique Lexicographically Sortable Identifiers) for cursors, allowing the frontend to send `Last-Event-ID` on reconnect to flawlessly resume broken streams without duplicating data.
- **Railpack-based image build:** API clones the repository to a secure `/tmp` workspace, invokes the Railpack binary against the local BuildKit daemon, and outputs a tagged Docker image.
- **Caddy as single ingress:** 
  - `/` -> Frontend React App
  - `/api/*` -> Express Backend
  - `/deploy/:id/*` -> Dynamically routed to deployed user applications.
- **Runtime readiness probe:** The deployment pipeline actively polls the newly spawned container over HTTP. It only marks the deployment as successful once the app returns a `200 OK`.
- **Deterministic termination:** Temporary workspaces are wiped out via `finally` blocks, and containers are cleanly reaped.

---

## Bonus Requirements Coverage

### Rollbacks & Immutability
Every successful build is persistently recorded in the SQLite `builds` table and tagged immutably (e.g., `deploy-<id>:<buildId>`). 
The UI features a **Build History** panel. Clicking "Rollback" initiates a zero-downtime redeploy of that specific historical image tag without needing to re-run the Railpack build process.

### Zero-Downtime Redeploy Flow
1. A new build produces image `deploy-<id>:<buildId>`.
2. The pipeline starts a *new* container `app-<id>-<buildShort>` alongside the old one.
3. An **HTTP Readiness Probe** polls the new container until it is ready to accept traffic.
4. An atomic request is sent to the Caddy Admin API to patch the `/deploy/:id/*` upstream to the new container.
5. *Only after* Caddy has successfully diverted traffic is the previous container gracefully terminated via `dockerode`.

---

## Project Layout

- `docker-compose.yml` - Complete system topology (Frontend, Backend, Caddy, BuildKit).
- `api/` - Express backend, Dockerode orchestrator, SSE log emitters, and pipeline workers.
- `frontend/` - React SPA with custom Vanilla CSS aesthetic.
- `caddy/` - Base reverse proxy configuration.

---

## Run Locally

**Prerequisites:**
- Docker + Docker Compose plugin
- Internet access (to pull Base Images & Railpack)
- Port 80 available on the host machine.

**Start the Platform:**
```bash
docker compose up --build -d
```
Then navigate to `http://localhost` in your browser.

---

## API Surface

- **POST /api/deployments**
  - Accepts JSON `{ "gitUrl": "https://..." }` or `multipart/form-data` with a zip file.
- **GET /api/deployments** - List all active applications.
- **GET /api/deployments/:id/builds** - Retrieve the immutable build history for rollbacks.
- **POST /api/deployments/:id/rollback** - Instigates a zero-downtime rollback to a specific `build_id`.
- **GET /api/deployments/:id/logs** - Subscribes to Server-Sent Events (SSE). Accepts `Last-Event-ID` header for cursor resumption.

---

## SSE Contract
- Log events use standard SSE.
- Every event is emitted with an `id:` equal to its database ULID. This guarantees lexicographical sorting.
- If the browser drops connection, the native `EventSource` automatically reconnects and sends the `Last-Event-ID` header. The API parses this and instantly replays only the logs that were missed during the blackout.

---

## Tradeoffs & What I'd Replace Before Production

**Time Spent:** ~14 hours

If I were migrating this from a Take-Home to an Enterprise Production Environment, I would execute the following architectural shifts:

1. **Move off the Docker Socket:**
   - *Current:* The API mounts `/var/run/docker.sock` to orchestrate sibling containers.
   - *Production:* This is a massive security risk in production. I would rip this out and replace it by having the API communicate with a dedicated Nomad or Kubernetes control plane API.
2. **Distributed Route Locking:**
   - *Current:* We use an in-memory `async-mutex` in Node.js to ensure concurrent deployments don't cause race conditions when patching Caddy routes.
   - *Production:* If we scaled the API horizontally to multiple replicas, the in-memory mutex would fail. I would replace it with a distributed lock (e.g., Redis Redlock or Postgres Advisory Locks).
3. **Build Image Garbage Collection:**
   - *Current:* We keep all historical Docker images on the host disk to ensure Rollbacks are instant.
   - *Production:* This will eventually trigger a `DiskPressure` event. I would implement an LRU (Least Recently Used) garbage collector via a cron job to prune images older than the last 5 successful builds.
4. **Queueing System:**
   - *Current:* Deployments are fire-and-forget asynchronous functions in Express. If the Node container crashes mid-deploy, the deployment is permanently orphaned.
   - *Production:* I would introduce a durable task queue (like BullMQ + Redis) to ensure pipelines can survive API restarts and auto-resume.

---

## ☁️ Brimble Deploy + Feedback

> **IMPORTANT:** I deployed a simple Vite application to Brimble to test the platform.

**Deployment URL:** `https://brimble-feedback.brimble.app` *(or replace with your exact Brimble URL if different)*

**Feedback on the Deploy Experience:**
The deployment flow is generally very smooth, but I encountered two significant points of friction:
1. **Billing/Quota Bug:** When I linked my new GitHub account, before I even deployed a single app, the system told me to "update my plan" and the billing page erroneously showed that I had already used all 650 free minutes. This is a critical onboarding bug that prevents new users from trying the platform.
2. **UI Overlap:** During the onboarding flow, the progress pill (e.g., "3/6 completed") overlaps directly with the floating chat/action bubble button on the bottom right of the screen, making the UI look broken and difficult to click.

Otherwise, the core deployment infrastructure feels solid!
---

## Founder Walkthrough Talking Points

- **Why Dockerode over CLI Spawning?** Relying on string-parsing standard output from `child_process.spawn('docker run...')` is brittle. By using `dockerode`, I communicate with the Docker Daemon via typed REST APIs, which allows for robust error handling, precise container lifecycles, and exact stream multiplexing.
- **Why pure Vanilla CSS?** Anybody can use Tailwind to make a decent UI. Building a dynamic, responsive, glassmorphic dashboard from scratch using CSS Grid, CSS Variables, and advanced pseudo-selectors demonstrates a much deeper mastery of the browser rendering engine.
- **Why ULID over UUID?** UUIDv4 is entirely random. When streaming logs from a database, querying `SELECT * WHERE id > last_cursor` with UUIDs causes severe B-Tree index fragmentation. ULIDs embed a timestamp, making them lexicographically sortable. This allows the database to execute cursor-based pagination instantly, which is vital for high-throughput SSE reconnections.
