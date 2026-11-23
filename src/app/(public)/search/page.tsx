import { redirect } from 'next/navigation';

export default async function SearchRedirectPage(
  props: {
    searchParams: Promise<{ q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const qs = new URLSearchParams();
  if (searchParams.q) qs.set('q', searchParams.q);
  redirect(`/products?${qs.toString()}`);
}