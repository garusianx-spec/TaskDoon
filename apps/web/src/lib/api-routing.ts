export const workspacePath = (workspaceId: string) => `/workspaces/${workspaceId}`;

/** Follows `nextCursor` until the end (lists the app keeps whole, such as the tasks). */
export async function everyPage<T>(
  fetchPage: (
    cursor: string | null,
  ) => Promise<{ readonly items: readonly T[]; readonly nextCursor: string | null }>,
  max = 50,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < max; page += 1) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}
