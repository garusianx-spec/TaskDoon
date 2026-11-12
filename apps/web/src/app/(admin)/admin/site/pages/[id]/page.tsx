import { SiteDocumentEditor } from '@/features/admin/components/site/SiteDocumentEditor';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SiteDocumentEditor id={id} />; }
