import { redirect } from 'next/navigation';

export default function SearchRedirectPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const qs = new URLSearchParams();
  if (searchParams.q) qs.set('q', searchParams.q);
  redirect(`/products?${qs.toString()}`);
}