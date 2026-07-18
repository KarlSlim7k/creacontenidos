// Puerto de newsArticleJsonLd() (apps/api/src/lib/nota-ssr.js) — antes generado
// por un regex-hack en Express; ahora nace directo en el frontmatter de la página.
import type { Article } from './api';

const SITE_URL = 'https://crea-contenidos.com';

export function newsArticleJsonLd(article: Article, image: string | null): string {
  const url = SITE_URL + '/notas/' + encodeURIComponent(article.slug);
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.dek || '',
    mainEntityOfPage: url,
    author: { '@type': 'Person', name: article.author_name || 'Redacción CREA Contenidos' },
    publisher: {
      '@type': 'Organization',
      name: 'CREA Contenidos',
      logo: { '@type': 'ImageObject', url: SITE_URL + '/assets/img/logo-crea.png' },
    },
  };
  if (image) data.image = [image];
  if (article.published_at) data.datePublished = new Date(article.published_at).toISOString();
  if (article.section) data.articleSection = article.section;
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
