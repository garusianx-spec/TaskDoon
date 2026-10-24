'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

/** Progressive enhancement: server content stays visible if JavaScript never loads. */
export function RevealOnScroll({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        element.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
        observer.unobserve(element);
      }
    }, { threshold: .08 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [delay]);
  return <div ref={ref} className={className}>{children}</div>;
}

export function HeroParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia('(min-width: 1100px) and (prefers-reduced-motion: no-preference) and (pointer: fine)');
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (!media.matches) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = element.getBoundingClientRect();
        element.style.setProperty('--parallax-x', `${(event.clientX - bounds.left - bounds.width / 2) / 100}px`);
        element.style.setProperty('--parallax-y', `${(event.clientY - bounds.top - bounds.height / 2) / 100}px`);
      });
    };
    const reset = () => { element.style.setProperty('--parallax-x', '0px'); element.style.setProperty('--parallax-y', '0px'); };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', reset);
    media.addEventListener('change', reset);
    return () => { cancelAnimationFrame(frame); element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', reset); media.removeEventListener('change', reset); };
  }, []);
  return <div ref={ref} className="home-hero-stage">{children}</div>;
}

export function Showcase({ children, videoUrl, captions, label }: { children: ReactNode; videoUrl?: string; captions?: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState(false);
  return <div className={`home-showcase ${playing ? 'is-playing' : ''}`}>
    {playing && videoUrl ? <video className="home-showcase-video" controls autoPlay playsInline src={videoUrl}><track kind="captions" src={captions} srcLang="fa" label="فارسی" /></video> : <>{children}<div className="home-showcase-overlay" /><Button variant="secondary" className="home-play" aria-label={videoUrl ? 'پخش ویدئوی معرفی محصول' : 'نمایش وضعیت پیش‌نمایش محصول'} onClick={() => videoUrl ? setPlaying(true) : setPreview(!preview)}><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M7 3v18l15-9z" fill="currentColor" /></svg></Button>{preview && <p role="status" className="home-preview-status">{label}</p>}</>}
  </div>;
}

export function TestimonialCarousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (direction: number) => {
    const element = ref.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * .85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div className="home-testimonial-carousel"><div ref={ref} className="home-quotes" role="region" aria-label="دیدگاه‌های نمایشی؛ برای مرور جابه‌جا شوید" tabIndex={0}>{children}</div><div className="home-carousel-controls"><Button variant="secondary" aria-label="دیدگاه‌های قبلی" onClick={() => move(1)}>→</Button><Button variant="secondary" aria-label="دیدگاه‌های بعدی" onClick={() => move(-1)}>←</Button></div></div>;
}
