export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configured)) {
    return configured.replace(/\/$/, '');
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return (configured || 'http://localhost:3000').replace(/\/$/, '');
}
