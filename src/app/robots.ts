import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3010';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/products', '/categories', '/search'],
        disallow: [
          '/admin/',
          '/seller/',
          '/account/',
          '/api/',
          '/auth/',
          '/support/',
          '/notifications',
          '/verify-mfa',
          '/reset-password',
          '/purchase/track/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
