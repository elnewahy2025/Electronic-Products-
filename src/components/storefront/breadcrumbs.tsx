import Link from 'next/link';
import { Fragment } from 'react';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <Fragment key={idx}>
              {idx > 0 && <span className="mx-1 opacity-50">/</span>}
              {item.href && !isLast ? (
                <li>
                  <Link href={item.href} className="hover:text-foreground hover:underline">
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li className={isLast ? 'text-foreground font-medium' : ''}>
                  {item.label}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
