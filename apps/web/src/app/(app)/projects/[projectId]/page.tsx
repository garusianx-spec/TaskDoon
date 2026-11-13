import { ProjectTasksPage } from '@/features/board/components/TasksScreen';

export default async function ProjectPage({
  params,
}: {
  readonly params: Promise<{ readonly projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectTasksPage projectId={projectId} />;
}
