'use client';

import { useState } from 'react';

type GalleryProps = {
  images: string[];
  title: string;
};

export function ProductGallery({ images, title }: GalleryProps) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="border rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
        <span className="text-muted-foreground text-sm">لا تتوفر صورة</span>
      </div>
    );
  }

  const main = images[active] ?? images[0];

  return (
    <div className="space-y-3">
      <div className="border rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
        <img
          src={main}
          alt={title}
          loading="eager"
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 w-20 h-20 border-2 rounded overflow-hidden bg-muted ${
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
    </div>
  );
}
