# Container Dashboard — Learn Docker Monitoring with NVIDIA AI Workbench

A hands-on example built with React, TypeScript, Express and server-sent events. Monitor containers on your Linux Docker host and explore how the interface and API work together. This is an independent learning project, not an NVIDIA-supported product.

Use it as a local Docker monitoring utility: browse containers, inspect CPU and memory usage, follow logs, and view available hardware metrics in one web dashboard. Optional token-protected controls let you start, stop, restart or remove containers. Run it through NVIDIA AI Workbench or directly with Docker Compose.

### See What Is Running

- **Containers:** group services by Compose project and inspect their status, ports and uptime.
- **Live metrics:** view CPU and memory charts, with stale/disconnected stream indicators.
- **Logs:** follow container output from the browser.
- **Optional controls:** unlock start, stop, restart and remove actions with a private token.

### Make It Your Own

- **Interface:** edit React components and light/dark styling.
- **Backend:** explore Docker API calls, metric parsing and streaming.
- **NVIDIA hardware:** add GPU process memory attribution and temperature readings where supported.

## Get Started

Choose **First Launch with NVIDIA AI Workbench** or **Run without AI Workbench** below. Both use the same `compose.yaml` and monitor the Docker host whose socket is mounted into the dashboard.

### Prerequisites

- A **Linux Docker host**. For the Workbench launch, install [NVIDIA AI Workbench](https://www.nvidia.com/en-us/deep-learning-ai/solutions/data-science/workbench/) and connect a project location to that host.
- Docker Engine running on that host, with `/var/run/docker.sock` available.
- Docker Compose v2 and permission to use Docker as your normal user.
- An NVIDIA GPU, working host drivers, NVIDIA Container Toolkit configured for Docker, and a Compose version that supports GPU device requests. The default Compose service enables GPU access and shares the host PID namespace.
- Internet access for the first image build and dependency downloads.
- A browser. No API subscription, Python packages or model downloads are needed.

The Workbench project container uses the Python Basic template. The dashboard runs in a **separate Compose service** built from Node.js images. Starting the project container alone does not start the dashboard. Use the Docker host's terminal for the commands below; Docker does not need to be installed inside the Python project container.

### First Launch with NVIDIA AI Workbench

1. Open AI Workbench and select the location whose Docker containers you want to monitor.
2. Open this project. For a published copy, choose **Clone Project** and paste its repository URL.
3. Generate a private control token on the Docker host:

   ```bash
   openssl rand -hex 32
   ```

4. When Workbench shows **Resolve Now**, enter that value for `DASHBOARD_CONTROL_TOKEN`. If the banner is missing, open **Environment > Project Container > Variables > Configure**. Workbench stores the value outside the committed spec. Keep a private copy for unlocking the interface. An already configured secret may not prompt again.
5. On the **Docker host** (not inside the Workbench project container), run:

   ```bash
   stat -c '%g' /var/run/docker.sock
   ```

   This prints the Docker socket's numeric group ID, for example `999`. Reading it normally does **not** require `sudo`. Use the result from your own host.
6. In Workbench, open **Environment > Project Container > Environment Variables > Add** (some versions label this section **Variables**). Set **Name / Key** to `DOCKER_GID`, **Value** to the number from step 5, and leave **Sensitive** unchecked. Select **Add / Save**. `DOCKER_GID` is not a secret. Enter the number, not the shell command.
7. Open **Environment > Compose** and start the stack, building it when prompted. If it is already running, stop and start the Compose stack to apply the variable. Starting only the project container does not start the dashboard.
8. Open **http://127.0.0.1:7777** in a browser on that host. Select a container to view its metrics and logs. The browser must be on the Docker host; this guide does not configure remote access.

### Run without AI Workbench

AI Workbench is optional. Clone or download this repository onto the Linux Docker host, then open a terminal in the repository root—the directory containing `compose.yaml`—and run:

```bash
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
docker compose up -d --build
```

Open **http://127.0.0.1:7777** in a browser on that host. Docker builds the application and installs its Node.js dependencies inside the image; you do not need Node.js, Python, or a Workbench project container installed on the host. The NVIDIA prerequisites above still apply because `compose.yaml` requests GPU access by default.

For this launch path, Compose reads the exported shell variables; it does not automatically load Workbench's `variables.env` or saved secrets. If a Workbench-managed dashboard is already running on port `7777`, stop it before starting a separate stack, or choose a different `DASHBOARD_PORT` as described below.

**The terminal launch above starts in viewing mode.** A secret saved in Workbench is not automatically exported into an unrelated host terminal. See “Unlock Controls with a Host-Terminal Launch” below to enable actions through the terminal, or start Compose through Workbench to use its configured secret.

### Fresh Clone and Local Configuration

`variables.env` is versioned. Configure `DOCKER_GID` for each host; never copy another machine's group ID. The default dashboard port is `7777`, so `DASHBOARD_PORT` is optional. Review changes to `variables.env` before committing and leave host-specific values out of public commits.

`DASHBOARD_CONTROL_TOKEN` is declared in `.project/spec.yaml`, but its value belongs in Workbench's sensitive-variable storage. Each fresh clone needs its own generated token. Never paste a real token into a tracked file.

To replace an existing local token, generate a new one with `openssl rand -hex 32`, update `DASHBOARD_CONTROL_TOKEN` under **Environment > Project Container > Variables**, then stop and start Compose. Use the new token in the dashboard's control panel. Removing a value from the repository does not clear Workbench's saved local configuration or replace a running container's environment.

### Unlock Controls with a Host-Terminal Launch

In the same host terminal used to launch Compose, set a token and recreate the service:

```bash
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
read -r -s -p 'Paste your control token: ' DASHBOARD_CONTROL_TOKEN
printf '\n'
export DASHBOARD_CONTROL_TOKEN
docker compose up -d
```

Paste the token generated earlier, then press Enter. The value is hidden while typing. Enter the same token in the dashboard's control panel to unlock actions. Select **Lock controls** or reload the page to clear browser access. **Stop, restart and remove affect real containers**; use a disposable test container when learning.

### Stop, View Logs or Change the Port

Run from the repository root on the Docker host:

```bash
# Show service state.
docker compose ps

# Follow dashboard server logs; Ctrl+C stops following.
docker compose logs -f dashboard

# Stop and remove this Compose stack's containers.
docker compose down
```

If another service uses port 7777, set a free port before starting:

```bash
export DASHBOARD_PORT=7788
docker compose up -d
```

Then open `http://127.0.0.1:7788`. When using Workbench, change `DASHBOARD_PORT` in its project variables instead. Keep your chosen variables available for later Compose commands.

## Security and Current Limitations

This is a **trusted local administration example**. The service publishes its port only on loopback, but the Docker socket gives the backend powerful access to the host. Disabling browser controls does not remove that socket access.

- Monitoring, metadata and log reads have **no authentication**. Application logs can contain sensitive information.
- Container actions require a token and allowed localhost Host/Origin values. No token means actions are disabled.
- Keep tokens in Workbench's secret configuration or a private process environment. Never commit real tokens or place them in `variables.env`.
- Do not publish the dashboard or Docker socket directly to the internet. Use a trusted host and SSH tunnel for remote viewing.
- The current committed dependency lockfile has known vulnerabilities. The pre-publication audit reported 17 affected packages overall, including 7 production dependencies (1 critical, 2 high, 4 moderate). These are audit ratings, not a finding that every advisory is exploitable here. Resolve and re-audit dependencies before treating this as a secure deployment example.
- Log requests do not yet have a maximum `tail` value or a connection limit.
- Automated stream tests are included. Manual browser integration for reconnect, container switching and stopped-to-running transitions remains unverified.

To check current dependency advisories from `code/`:

```bash
npm audit --package-lock-only
npm audit --package-lock-only --omit=dev
```

An audit exits nonzero when it finds vulnerabilities. Review fixes and rerun the tests/build; do not apply forced major upgrades without reviewing the changes.

## License

This project is licensed under the [MIT License](LICENSE). Dependency licenses remain separate.

## Other Resources

- [Download NVIDIA AI Workbench](https://www.nvidia.com/en-us/deep-learning-ai/solutions/data-science/workbench/)
- [NVIDIA AI Workbench User Guide](https://docs.nvidia.com/ai-workbench/)
- [Project specification and secrets](https://docs.nvidia.com/ai-workbench/reference/projects/spec/)
- [Workbench Compose environments](https://docs.nvidia.com/ai-workbench/concepts/compose-concept/)
- [Docker daemon security](https://docs.docker.com/engine/security/)
