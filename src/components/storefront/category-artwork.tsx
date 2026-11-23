import {
  BookOpen,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Headphones,
  ImageIcon,
  LayoutTemplate,
  MonitorPlay,
  Package,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import { getCategoryArt, type CategoryArtAccent, type CategoryArtKind } from '@/lib/category-art';

const ICONS: Record<CategoryArtKind, LucideIcon> = {
  presentation: Presentation,
  lessons: ClipboardList,
  books: BookOpen,
  templates: LayoutTemplate,
  video: MonitorPlay,
  audio: Headphones,
  sheets: FileSpreadsheet,
  documents: FileText,
  design: ImageIcon,
  general: Package,
};

const ACCENT_CLASS: Record<CategoryArtAccent, string> = {
  mint: 'text-brand-foreground',
  amber: 'text-warning-soft',
  green: 'text-success-soft',
};

/**
 * Decorative, subject-expressive artwork for a category card.
 * Purely presentational: the surrounding link provides the accessible name.
 */
export function CategoryArtwork({ name, slug }: { name: string; slug: string }) {
  const { kind, accent } = getCategoryArt(name, slug);
  const Icon = ICONS[kind];

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <span className="absolute -start-12 -top-16 h-44 w-44 rounded-full bg-white/5" />
      <span className="absolute -end-16 -bottom-20 h-56 w-56 rounded-full bg-white/5" />
      <span
        className="absolute inset-0 text-brand-foreground opacity-10"
        style={{ backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 18px)' }}
      />
      <span className="absolute start-6 top-5 h-1.5 w-1.5 rounded-full bg-white/40" />
      <span className="absolute end-8 bottom-6 h-2 w-2 rounded-full bg-white/25" />

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="absolute h-[72px] w-[104px] -rotate-6 rounded-[14px] border border-white/10 bg-white/5" />
        <span className="absolute h-[72px] w-[104px] translate-x-3 translate-y-2 rotate-6 rounded-[14px] border border-white/10 bg-white/5" />
        <span className="relative grid h-[78px] w-[110px] place-items-center rounded-[16px] border border-white/20 bg-white/10 shadow-lg">
          <Icon className={`h-10 w-10 ${ACCENT_CLASS[accent]}`} strokeWidth={1.6} />
        </span>
      </div>
    </div>
  );
}
