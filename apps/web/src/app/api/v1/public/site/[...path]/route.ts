import type { NextRequest } from 'next/server';
import type { SiteSubmissionInput } from '@taskin/contracts';
import { recordSeedSiteSubmission, resolveSeedPublicSite } from '@/data/site-seed';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const subPath = `/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const result = resolveSeedPublicSite(subPath);
  if (result === null) {
    return Response.json({ message: 'Not found' }, { status: 404 });
  }
  return Response.json(result, { status: 200 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  if (path.join('/') !== 'submissions') {
    return Response.json({ message: 'Not found' }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as SiteSubmissionInput | null;
  if (
    !body ||
    typeof body.fullName !== 'string' ||
    body.fullName.trim().length < 2 ||
    typeof body.message !== 'string' ||
    body.message.trim().length < 10 ||
    (!body.email && !body.phone) ||
    !body.consent
  ) {
    return Response.json({ message: 'Invalid submission payload' }, { status: 400 });
  }
  const created = recordSeedSiteSubmission(body);
  return Response.json(created, { status: 201 });
}
