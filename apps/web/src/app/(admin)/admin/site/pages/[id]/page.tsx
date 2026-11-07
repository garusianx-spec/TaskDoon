import { SiteDocumentEditor } from '@/components/admin/site/SiteDocumentEditor';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SiteDocumentEditor id={id} />; }
