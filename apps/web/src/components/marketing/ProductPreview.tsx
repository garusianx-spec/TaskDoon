'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import type { SiteItem } from '@taskin/contracts';
import { siteMediaHref } from '@/lib/site-utils';

export function ProductPreview({ items }: { items: SiteItem[] }) {
  const usable = items.filter(item => item.media && siteMediaHref(item.media.src));
  const [active, setActive] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!usable.length) return null;
  const selected = usable[active] ?? usable[0]!;
  function onKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowLeft') next = (index + 1) % usable.length;
    else if (event.key === 'ArrowRight') next = (index - 1 + usable.length) % usable.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = usable.length - 1;
    else return;
    event.preventDefault(); setActive(next); tabs.current[next]?.focus();
  }
  return <div className="marketing-product-preview">
    <div role="tablist" aria-label="بخش‌های محصول" className="marketing-preview-tabs">
      {usable.map((item, index) => <button key={item.id ?? index} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} ref={node => { tabs.current[index] = node; }} onClick={() => setActive(index)} onKeyDown={event => onKeys(event, index)}>{item.title}</button>)}
    </div>
    {usable.map((item, index) => <div key={item.id ?? index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0}>
      {active === index && item.media && <div className="marketing-screen-frame"><div className="marketing-screen-toolbar" aria-hidden="true"><span /><span /><span /><div>TaskDoon / {selected.title}</div></div><Image src={item.media.src} alt={item.media.alt} width={item.media.width ?? 1440} height={item.media.height ?? 1000} className="marketing-product-image" sizes="(max-width: 768px) 95vw, 1120px" unoptimized={!item.media.src.startsWith('/')} /></div>}
      {item.description && <p className="marketing-preview-caption">{item.description}</p>}
    </div>)}
  </div>;
}
