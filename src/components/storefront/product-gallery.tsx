'use client';

import { useEffect, useState } from 'react';
import { Maximize2, X, ChevronLeft, ChevronRight } from 'lucide-react';

type GalleryProps = {
  images: string[];
  title: string;
};

export function ProductGallery({ images, title }: GalleryProps) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight' && images.length > 1) {
        setActive(prev => (prev - 1 + images.length) % images.length);
      }
      if (e.key === 'ArrowLeft' && images.length > 1) {
        setActive(prev => (prev + 1) % images.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, images.length]);

  if (images.length === 0) {
    return (
      <div className="border border-border rounded-xl overflow-hidden bg-muted aspect-video flex items-center justify-center">
        <span className="text-muted-foreground text-sm">لا تتوفر صورة معاينة</span>
      </div>
    );
  }

  const main = images[active] ?? images[0];

  return (
    <div className="space-y-3">
      <div className="relative group border border-border rounded-xl overflow-hidden bg-muted aspect-video flex items-center justify-center">
        <img
          src={main}
          alt={title}
          loading="eager"
          onClick={() => setLightboxOpen(true)}
          className="max-h-full max-w-full object-contain cursor-zoom-in"
        />
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-black/70 text-white px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-black/85 transition"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span>تكبير المعاينة</span>
        </button>
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 w-20 h-20 border-2 rounded-lg overflow-hidden bg-muted transition ${
                active === i ? 'border-primary' : 'border-transparent hover:border-muted-foreground/40'
              }`}
              aria-label={`صورة ${i + 1}`}
            >
              <img
                src={url}
                alt={`${title} - ${i + 1}`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`معاينة مكبّرة — ${title}`}
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 left-4 rounded-full bg-white/15 hover:bg-white/25 text-white p-2 transition"
            aria-label="إغلاق المعاينة"
          >
            <X className="h-5 w-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(prev => (prev - 1 + images.length) % images.length);
                }}
                className="absolute right-4 rounded-full bg-white/15 hover:bg-white/25 text-white p-2.5 transition"
                aria-label="الصورة السابقة"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(prev => (prev + 1) % images.length);
                }}
                className="absolute left-4 rounded-full bg-white/15 hover:bg-white/25 text-white p-2.5 transition"
                aria-label="الصورة التالية"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            </>
          )}

          <img
            src={main}
            alt={title}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
