'use client';



/** A line the system wrote into the conversation (a group created, a message turned into a task). */
export function SystemLine({ text }: { readonly text: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full bg-sunken px-3 py-1 text-micro text-fg-tertiary">{text}</span>
    </div>
  );
}
