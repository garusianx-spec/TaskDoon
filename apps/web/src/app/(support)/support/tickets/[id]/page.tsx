'use client';
import { useParams } from 'next/navigation';
import { TicketThread } from '@/features/support/TicketThread';
import { useSupportUser } from '@/features/support/SupportSession';
export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const user = useSupportUser();
  return <TicketThread key={user.id + id} id={id} actorKey={user.id} />;
}
