import { fileEndpoints } from '@/api/file-endpoints';
import { contentTypeOf,postForm } from '@/api/uploads';
import { ApiProblem } from '@/lib/api-client';

/** Uploads to the temporary key. The workspace endpoint claims it after authorization. */
export async function uploadWorkspaceIcon(image: Blob, fileName = ''): Promise<string> {
  const type = contentTypeOf(image, fileName);
  const ticket = await fileEndpoints.files.iconTicket();
  if (!ticket.contentTypes.includes(type) || image.size === 0 || image.size > ticket.maxBytes) {
    throw new ApiProblem(400, 'UPLOAD_INVALID', 'The image does not meet the icon upload requirements.', null);
  }
  await postForm(ticket.url, ticket.fields, image, type);
  return ticket.key;
}
