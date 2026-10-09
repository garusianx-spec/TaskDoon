/** Public, dependency-free probe: the Next server is accepting HTTP requests. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
