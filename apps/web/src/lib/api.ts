// Server-side fetch helper — reemplaza creaApi() de main.js. Corre en el
// servidor (frontmatter de página), no en el navegador: mismo proceso/contenedor
// que apps/api una vez montado en server.js (import() dinámico), loopback en dev.
const API_BASE = process.env.INTERNAL_API_BASE || 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function creaApi<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new ApiError(res.status, 'API respondió ' + res.status);
  return res.json() as Promise<T>;
}

// Puerto de renderEstudioSponsors() (main.js): deriva las marcas activas a
// partir de las notas patrocinadas publicadas (no hay tabla de "clientes
// destacados" separada) — una fila por sponsor_name distinto.
export async function getSponsors(): Promise<Article[]> {
  try {
    const articles = await creaApi<Article[]>('/api/public/articles?sponsored=true&limit=50');
    const bySponsor = new Map<string, Article>();
    for (const a of articles) {
      const name = a.sponsor_name || 'CREA Contenidos';
      if (!bySponsor.has(name)) bySponsor.set(name, a);
    }
    return [...bySponsor.values()];
  } catch {
    return [];
  }
}

export const OFFLINE_STATE = {
  title: 'La redacción está teniendo un detalle técnico',
  body: 'No pudimos cargar las notas en este momento. Vuelve a intentarlo en unos minutos; seguimos trabajando desde Perote.',
};

export interface Article {
  slug: string;
  title: string;
  dek: string;
  section: string;
  author_name: string;
  cover_image_url: string | null;
  published_at: string;
  is_sponsored: boolean;
  sponsor_name: string | null;
  body?: string;
}

export interface SocialPost {
  id: string;
  network: string;
  external_url: string;
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

export interface Service {
  id: number;
  name: string;
  price_label: string;
  description: string;
  features: string[];
  cta_interest: string | null;
}

export interface SiteMetrics {
  monthly_reach_label: string;
  municipalities_count: number;
  tercer_tiempo_listeners_label: string;
  audience_age_18_24_pct: number;
  audience_age_25_44_pct: number;
  audience_age_45_plus_pct: number;
  updated_at: string;
}

export interface Author {
  author_name: string;
  article_count: number;
  sections: string[];
}
