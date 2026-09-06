'use client';

/**
 * Projects & Tasks card for the client detail page — the visible half of the
 * Solutions Hub ↔ Projects bridge. Shows every PM project delivered for this
 * client (linked directly or via one of its solutions): status, owner, team
 * members with roles, and a done/total task rollup.
 */

import Link from 'next/link';
import { FolderKanban, Users, ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useClientProjects,
  type ClientProjectSummary,
} from '@/hooks/solutions/use-client-projects';

const RAG_CLASSES: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-red-100 text-red-800 border-red-200',
};

const RAG_LABELS: Record<string, string> = {
  green: 'On track',
  amber: 'At risk',
  red: 'Off track',
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ProjectRow({ project }: { project: ClientProjectSummary }) {
  const due = formatDate(project.dueDate);
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}`}
            className="font-medium hover:underline"
          >
            {project.title}
          </Link>
          {project.code && (
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              {project.code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {project.statusName && (
            <Badge variant="secondary">{project.statusName}</Badge>
          )}
          <Badge
            variant="outline"
            className={RAG_CLASSES[project.ragStatus] ?? RAG_CLASSES.green}
          >
            {RAG_LABELS[project.ragStatus] ?? RAG_LABELS.green}
          </Badge>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {project.percentComplete}% complete
        {' · '}
        {project.tasksTotal === 0
          ? 'No tasks yet'
          : `${project.tasksDone} of ${project.tasksTotal} task${project.tasksTotal !== 1 ? 's' : ''} done`}
        {due && ` · due ${due}`}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        {project.ownerName && (
          <Badge variant="outline" className="font-normal">
            {project.ownerName} · Owner
          </Badge>
        )}
        {project.members.map((m) => (
          <Badge key={m.staffId} variant="outline" className="font-normal capitalize">
            {m.name} · {m.role.replace(/_/g, ' ')}
          </Badge>
        ))}
        {!project.ownerName && project.members.length === 0 && (
          <span className="text-muted-foreground">Nobody assigned yet</span>
        )}
      </div>
    </div>
  );
}

interface ClientProjectsCardProps {
  clientId: string;
  /** The client's solution ids — projects linked only via a solution count too. */
  solutionIds: string[];
}

export function ClientProjectsCard({ clientId, solutionIds }: ClientProjectsCardProps) {
  const { data: projects, isLoading, error } = useClientProjects(clientId, solutionIds);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Projects &amp; Tasks
          </CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading projects...'
              : error
                ? 'Projects could not be loaded'
                : `${projects?.length ?? 0} project${(projects?.length ?? 0) !== 1 ? 's' : ''} delivering for this client`}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" asChild className="shrink-0">
          <Link href="/projects">
            Open Projects
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Projects could not be loaded — you may not have access to the
            Projects module.
          </p>
        ) : !projects || projects.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            <FolderKanban className="mx-auto h-8 w-8 mb-2" />
            <p>No projects linked to this client yet</p>
            <p className="text-xs mt-1">
              In the Projects module, create or edit a project and pick this
              client in the &quot;Client&quot; field.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
