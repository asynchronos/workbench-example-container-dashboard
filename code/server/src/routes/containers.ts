import { Router } from 'express';
import { docker } from '../docker.js';
import { getGpuMemoryByContainer } from '../gpu.js';
import { createUptimeResolver } from '../uptime.js';

export const containersRouter = Router();

const getUptimes = createUptimeResolver(async (id) => {
  const info = await docker.getContainer(id).inspect();
  return info.State;
});

// com.docker.compose.depends_on is a comma-separated list of "service:condition:required"
// entries (e.g. "postgres:service_healthy:true,llm-guard:service_healthy:true") — only the
// service name (before the first colon) is needed to build the dependency graph.
function parseDependsOn(label: string | undefined): string[] {
  if (!label) return [];
  return label
    .split(',')
    .map((entry) => entry.split(':')[0])
    .filter((service) => service.length > 0);
}

containersRouter.get('/', async (_req, res) => {
  try {
    const [containers, gpuMemory] = await Promise.all([
      docker.listContainers({ all: true }),
      getGpuMemoryByContainer(),
    ]);
    const uptimes = await getUptimes(containers);
    res.json(
      containers.map((c) => ({
        id: c.Id,
        name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
        image: c.Image,
        state: c.State,
        status: c.Status,
        // Docker's Status string varies: "(healthy)", "(unhealthy)", or "(health: starting)".
        health: c.Status.match(/\((?:health: )?(\w+)\)/)?.[1] ?? null,
        created: c.Created,
        uptime: uptimes.get(c.Id) ?? '—',
        ports: c.Ports.filter((p) => p.PublicPort).map((p) => p.PublicPort),
        gpuMemUsage: gpuMemory.available ? gpuMemory.byContainer.get(c.Id) ?? 0 : null,
        composeProject: c.Labels['com.docker.compose.project'] ?? null,
        composeService: c.Labels['com.docker.compose.service'] ?? null,
        dependsOn: parseDependsOn(c.Labels['com.docker.compose.depends_on']),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

containersRouter.get('/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    // Build every nested object explicitly: Docker inspect includes environment
    // values and other metadata that must never reach the browser.
    res.json({
      Id: info.Id,
      Name: info.Name,
      Config: { Image: info.Config.Image },
      NetworkSettings: {
        Ports: Object.fromEntries(
          Object.entries(info.NetworkSettings.Ports ?? {}).map(([port, bindings]) => [
            port,
            bindings?.map(({ HostIp, HostPort }) => ({ HostIp, HostPort })) ?? null,
          ])
        ),
        Networks: Object.fromEntries(
          Object.entries(info.NetworkSettings.Networks ?? {}).map(([name, network]) => [
            name,
            { IPAddress: network.IPAddress },
          ])
        ),
      },
      Mounts: (info.Mounts ?? []).map(({ Type, Source, Destination }) => ({
        Type, Source, Destination,
      })),
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode === 404 ? 404 : 500;
    res.status(status).json({ error: (err as Error).message });
  }
});
