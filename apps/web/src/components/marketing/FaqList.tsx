'use client';

import { useMemo, useState } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { normaliseForSearch } from '@taskin/text';
import { asText } from '@/lib/site-utils';
import { Input } from '@/components/ui/Input';

export function FaqList({ documents, searchable = false }: { documents: PublishedSiteDocument[]; searchable?: boolean }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const categories = [...new Set(documents.map(document => asText(document.data.category)).filter(Boolean))];
  const filtered = useMemo(() => documents.filter(document => (!category || document.data.category === category) && normaliseForSearch(`${document.title} ${asText(document.data.answer)} ${document.description}`).includes(normaliseForSearch(query))), [documents, category, query]);
  return <div className="marketing-faq-content">
    {searchable && <div className="marketing-faq-search"><Input label="جست‌وجو در پرسش‌ها" placeholder="دنبال چه پاسخی می‌گردید؟" type="search" value={query} onChange={event => setQuery(event.target.value)} />{categories.length > 0 && <div className="marketing-filter-tabs" role="group" aria-label="دسته‌بندی پرسش‌ها"><button type="button" aria-pressed={!category} onClick={() => setCategory('')}>همه</button>{categories.map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>}</div>}
    <div className="marketing-faq-list">{filtered.map(document => <details key={document.id} id={`faq-${document.slug}`} className="marketing-faq-item"><summary>{document.title}<span aria-hidden="true">+</span></summary><p>{asText(document.data.answer, document.description)}</p></details>)}</div>
    {!filtered.length && <p className="marketing-empty" role="status">پرسشی با این عبارت پیدا نشد. از راه فرم تماس با ما در ارتباط باشید.</p>}
  </div>;
}
