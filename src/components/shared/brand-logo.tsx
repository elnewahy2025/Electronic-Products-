import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

type Props = {
  href?: string;
  subtitle?: string;
  inverted?: boolean;
  className?: string;
};

export function BrandLogo({
  href = '/',
  subtitle,
  inverted = false,
  className,
}: Props) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة';

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2.5 font-bold text-[17px] whitespace-nowrap group',
        inverted ? 'text-brand-foreground' : 'text-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'w-[30px] h-[30px] rounded-[7px_7px_7px_2px] grid place-items-center shrink-0 transition-transform duration-150 group-hover:scale-105',
          inverted ? 'bg-white/15 text-[#9ce2bf]' : 'bg-brand text-[#9ce2bf]',
        )}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <span>{appName}</span>
      {subtitle && (
        <small
          className={cn(
            'hidden sm:inline text-[13px] font-medium border-s ps-2.5',
            inverted
              ? 'text-[#9ccbbd] border-[#3d7a6a]'
              : 'text-muted-foreground border-border',
          )}
        >
          {subtitle}
        </small>
      )}
    </Link>
  );
}
