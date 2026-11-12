/** Public liveness response for the standalone Next server. */
export function webHealth(): Response {
  return Response.json({ status: 'ok' }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
