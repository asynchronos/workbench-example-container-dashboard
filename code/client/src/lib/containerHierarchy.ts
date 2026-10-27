import type { ContainerSummary } from '../api/client';

const STANDALONE_GROUP = '(standalone)';

export interface HierarchyRow {
  container: ContainerSummary;
  level: number;
}

export interface HierarchyGroup {
  project: string;
  rows: HierarchyRow[];
}

export function groupByProjectHierarchy(containers: ContainerSummary[]): HierarchyGroup[] {
  const byProject = new Map<string, ContainerSummary[]>();
  for (const c of containers) {
    const project = c.composeProject ?? STANDALONE_GROUP;
    const list = byProject.get(project);
    if (list) list.push(c);
    else byProject.set(project, [c]);
  }

  const projects = [...byProject.keys()].sort((a, b) => {
    if (a === STANDALONE_GROUP) return 1;
    if (b === STANDALONE_GROUP) return -1;
    return a.localeCompare(b);
  });

  return projects.map((project) => {
    const rows = byProject
      .get(project)!
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((container) => ({ container, level: 0 }));
    return { project, rows };
  });
}
