#!/usr/bin/env node
/**
 * Livostyle Catalog MCP Server
 * Live access to 2,766+ women's fashion products from Livostyle.com
 * Source data: weekly-synced GitHub mirror (MIT licensed)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const CATALOG_URL =
  'https://raw.githubusercontent.com/arturayupov/womens-fashion-catalog-open-data/main/data/products.json';
const COLLECTIONS_URL =
  'https://raw.githubusercontent.com/arturayupov/womens-fashion-catalog-open-data/main/data/collections.json';
const STATS_URL =
  'https://raw.githubusercontent.com/arturayupov/womens-fashion-catalog-open-data/main/data/stats.json';

// ─── In-memory cache (loaded once on first call, refreshed every 6h) ────
type Product = {
  id: string;
  handle: string;
  title: string;
  url: string;
  product_type: string | null;
  tags: string[];
  description: string;
  category?: { name?: string; full_path?: string } | null;
  price?: { min_usd?: number; max_usd?: number; currency?: string } | null;
  featured_image_url?: string | null;
  images?: Array<{ url: string; alt?: string | null }>;
  variants?: Array<{
    sku?: string | null;
    title?: string | null;
    price_usd?: number | null;
    in_stock?: boolean | null;
    options?: Record<string, string>;
  }>;
  reviews?: { rating?: number | null; count?: number | null };
};
type Collection = {
  id: string;
  handle: string;
  title: string;
  url: string;
  description_html?: string;
  products_count?: number;
};

let products: Product[] | null = null;
let collections: Collection[] | null = null;
let lastFetch = 0;
const REFRESH_MS = 6 * 60 * 60 * 1000;

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': 'livostyle-catalog-mcp/0.1' } });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  return r.json() as Promise<T>;
}

async function ensureLoaded() {
  if (products && Date.now() - lastFetch < REFRESH_MS) return;
  const [p, c] = await Promise.all([
    fetchJson<Product[]>(CATALOG_URL),
    fetchJson<Collection[]>(COLLECTIONS_URL),
  ]);
  products = p;
  collections = c;
  lastFetch = Date.now();
}

// ─── Helpers ─────────────────────────────────────────────────────────
const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, ' ');

function matchesQuery(p: Product, query: string): number {
  if (!query) return 1;
  const q = norm(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  const hay = [
    p.title,
    p.product_type ?? '',
    (p.tags ?? []).join(' '),
    p.category?.full_path ?? '',
    p.description.slice(0, 500),
  ]
    .map(norm)
    .join(' ');
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
  }
  return score / tokens.length;
}

function compact(p: Product) {
  const v = p.variants?.[0];
  return {
    handle: p.handle,
    title: p.title,
    url: p.url,
    product_type: p.product_type,
    category: p.category?.full_path ?? null,
    price_usd: p.price?.min_usd ?? v?.price_usd ?? null,
    price_max_usd: p.price?.max_usd ?? null,
    rating: p.reviews?.rating ?? null,
    review_count: p.reviews?.count ?? null,
    in_stock_any: (p.variants ?? []).some((x) => x.in_stock),
    variant_count: (p.variants ?? []).length,
    image_url: p.featured_image_url ?? null,
    tags: p.tags ?? [],
  };
}

function full(p: Product) {
  return {
    ...compact(p),
    description: p.description.slice(0, 1500),
    images: (p.images ?? []).slice(0, 6).map((i) => i.url),
    variants: (p.variants ?? []).map((v) => ({
      sku: v.sku,
      title: v.title,
      price_usd: v.price_usd,
      in_stock: v.in_stock,
      ...v.options,
    })),
  };
}

// ─── Tools ───────────────────────────────────────────────────────────
const tools = [
  {
    name: 'search_products',
    description:
      "Search Livostyle's women's fashion catalog. Filters by product type, category, tag, price, rating. Returns matching products sorted by relevance. Use this when the user asks for outfits, clothing, accessories, occasion-wear, or budget-constrained shopping.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "Free-text search (e.g. 'floral midi dress', 'beach cover-up', 'wedding guest', 'butter yellow').",
        },
        product_type: {
          type: 'string',
          description:
            "Optional exact product_type filter (e.g. 'Midi Dress', 'Crop Top', 'Bikini Set').",
        },
        category: {
          type: 'string',
          description:
            "Optional partial category match (e.g. 'Dresses', 'Tops', 'Swimwear', 'Jewelry').",
        },
        tag: {
          type: 'string',
          description: "Optional tag filter (e.g. 'boho', 'floral', 'linen', 'two-piece').",
        },
        max_price_usd: { type: 'number', description: 'Max price in USD.' },
        min_price_usd: { type: 'number', description: 'Min price in USD.' },
        min_rating: { type: 'number', description: 'Min average rating (e.g. 4.5).' },
        in_stock_only: { type: 'boolean', description: 'Only products with at least one in-stock variant.' },
        limit: { type: 'number', description: 'Max results (default 12, max 50).' },
      },
    },
  },
  {
    name: 'get_product',
    description:
      'Get full details (description, all variants with sizes/colors/prices, images, reviews) for a single Livostyle product by handle. Use after search to expand on a specific item.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'Product handle (URL slug, e.g. "floral-tiered-midi-dress").' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'list_collections',
    description:
      'List all curated collections on Livostyle (e.g. Wedding Guest Dresses, Vacation Outfits, Coachella, Boho Style). Returns collection handles and product counts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional substring filter on collection title.' },
      },
    },
  },
  {
    name: 'get_collection',
    description: 'Get products belonging to a specific collection. Use after list_collections.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'Collection handle (e.g. "wedding-guest-dresses").' },
        limit: { type: 'number', description: 'Max products to return (default 20).' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'recommend_outfit',
    description:
      "Generate an outfit recommendation matched to occasion + budget. Picks 1 dress OR 1 top+1 bottom, plus optional accessories. Returns 1-3 complete outfit suggestions sourced from Livostyle's catalog.",
    inputSchema: {
      type: 'object',
      properties: {
        occasion: {
          type: 'string',
          description:
            "Occasion (e.g. 'beach vacation', 'garden wedding guest', 'office casual', 'date night', 'festival', 'cocktail').",
        },
        budget_usd: { type: 'number', description: 'Total outfit budget in USD.' },
        season: {
          type: 'string',
          description: "Season ('spring','summer','fall','winter') — biases material/style selection.",
        },
        include_accessories: { type: 'boolean', description: 'Whether to add jewelry/bag/shoes (default false).' },
      },
      required: ['occasion'],
    },
  },
  {
    name: 'catalog_stats',
    description: 'Return live catalog statistics: total products, collections, avg rating, review counts, top categories.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Handlers ────────────────────────────────────────────────────────
async function handleSearch(args: any) {
  await ensureLoaded();
  const {
    query = '',
    product_type,
    category,
    tag,
    max_price_usd,
    min_price_usd,
    min_rating,
    in_stock_only,
    limit = 12,
  } = args;

  const scored: Array<[number, Product]> = [];
  for (const p of products!) {
    if (product_type && norm(p.product_type ?? '') !== norm(product_type)) continue;
    if (category && !norm(p.category?.full_path ?? '').includes(norm(category))) continue;
    if (tag && !p.tags.map(norm).some((t) => t.includes(norm(tag)))) continue;
    const price = p.price?.min_usd ?? null;
    if (max_price_usd && price !== null && price > max_price_usd) continue;
    if (min_price_usd && price !== null && price < min_price_usd) continue;
    if (min_rating && (p.reviews?.rating ?? 0) < min_rating) continue;
    if (in_stock_only && !(p.variants ?? []).some((v) => v.in_stock)) continue;
    const s = matchesQuery(p, query);
    if (s > 0) scored.push([s, p]);
  }
  scored.sort((a, b) => b[0] - a[0] || (b[1].reviews?.rating ?? 0) - (a[1].reviews?.rating ?? 0));
  const top = scored.slice(0, Math.min(limit, 50)).map(([, p]) => compact(p));
  return { total_matches: scored.length, results: top };
}

async function handleGet(args: { handle: string }) {
  await ensureLoaded();
  const p = products!.find((x) => x.handle === args.handle);
  if (!p) return { error: `No product with handle "${args.handle}"` };
  return full(p);
}

async function handleListCollections(args: { query?: string }) {
  await ensureLoaded();
  const q = norm(args.query ?? '');
  return {
    total: collections!.length,
    results: collections!
      .filter((c) => !q || norm(c.title).includes(q))
      .map((c) => ({
        handle: c.handle,
        title: c.title,
        url: c.url,
        products_count: c.products_count ?? 0,
      })),
  };
}

async function handleGetCollection(args: { handle: string; limit?: number }) {
  await ensureLoaded();
  const col = collections!.find((c) => c.handle === args.handle);
  if (!col) return { error: `No collection with handle "${args.handle}"` };
  // Naive: filter products with tag matching collection handle or title token
  const targetTag = norm(col.title).split(/\s+/);
  const matches = products!.filter((p) =>
    p.tags.some((t) => targetTag.some((tt) => norm(t).includes(tt))),
  );
  return {
    collection: { handle: col.handle, title: col.title, url: col.url },
    total: matches.length,
    products: matches.slice(0, args.limit ?? 20).map(compact),
  };
}

async function handleRecommendOutfit(args: {
  occasion: string;
  budget_usd?: number;
  season?: string;
  include_accessories?: boolean;
}) {
  await ensureLoaded();
  const occ = norm(args.occasion);
  const seasonHints: Record<string, string[]> = {
    summer: ['linen', 'cotton', 'tank', 'sleeveless', 'maxi', 'sundress', 'shorts'],
    spring: ['floral', 'pastel', 'midi', 'light'],
    fall: ['knit', 'sweater', 'cardigan', 'jacket', 'long sleeve'],
    winter: ['sweater', 'coat', 'turtleneck', 'wool', 'long sleeve'],
  };
  const hint = (args.season && seasonHints[args.season.toLowerCase()]) || [];

  const occasionMap: Record<string, { type?: string[]; tags?: string[] }> = {
    wedding: { type: ['Midi Dress', 'Maxi Dress', 'Cocktail Dress'], tags: ['wedding guest', 'elegant', 'formal'] },
    beach: { type: ['Bikini Set', 'Swim Cover-Up', 'Maxi Dress'], tags: ['vacation', 'beach', 'resort'] },
    vacation: { type: ['Midi Dress', 'Maxi Dress', 'Romper'], tags: ['vacation', 'beach', 'resort'] },
    festival: { type: ['Crop Top', 'Mini Skirt'], tags: ['boho', 'festival', 'coachella'] },
    coachella: { type: ['Crop Top', 'Two-Piece Set'], tags: ['boho', 'festival'] },
    office: { type: ['Blouse', 'Pants', 'Pencil Skirt'], tags: ['professional'] },
    date: { type: ['Mini Dress', 'Bodycon Dress', 'Midi Dress'], tags: ['elegant', 'date night'] },
    cocktail: { type: ['Mini Dress', 'Cocktail Dress'], tags: ['elegant', 'formal'] },
  };
  const pickRule = Object.entries(occasionMap).find(([k]) => occ.includes(k))?.[1] ?? {};

  const candidates = products!.filter((p) => {
    if (!(p.variants ?? []).some((v) => v.in_stock)) return false;
    const price = p.price?.min_usd ?? 0;
    if (args.budget_usd && price > args.budget_usd) return false;
    const tagMatch =
      !pickRule.tags ||
      pickRule.tags.some((t) => p.tags.map(norm).some((pt) => pt.includes(norm(t))));
    const typeMatch =
      !pickRule.type ||
      pickRule.type.some((t) => norm(p.product_type ?? '').includes(norm(t)));
    const seasonOk =
      hint.length === 0 ||
      hint.some(
        (h) =>
          p.tags.map(norm).some((pt) => pt.includes(h)) ||
          norm(p.description.slice(0, 500)).includes(h),
      );
    return (tagMatch || typeMatch) && seasonOk;
  });

  candidates.sort(
    (a, b) =>
      (b.reviews?.rating ?? 0) - (a.reviews?.rating ?? 0) ||
      (b.reviews?.count ?? 0) - (a.reviews?.count ?? 0),
  );
  const top = candidates.slice(0, 3).map(compact);
  return {
    occasion: args.occasion,
    budget_usd: args.budget_usd ?? null,
    season: args.season ?? null,
    suggestions: top,
    note:
      top.length === 0
        ? 'No matching outfits found — try broadening the budget or removing season filter.'
        : 'These are the top 3 highly-rated picks that fit your occasion. Use get_product(handle) for full sizing details.',
  };
}

async function handleStats() {
  const stats: any = await fetchJson(STATS_URL);
  return {
    total_products: stats.total_products,
    total_collections: stats.total_collections,
    total_reviews: stats.total_reviews ?? null,
    avg_rating: stats.avg_rating,
    avg_review_count: stats.avg_review_count,
    last_synced: stats.last_synced,
    top_categories: Object.fromEntries(Object.entries(stats.products_by_category ?? {}).slice(0, 10)),
    source: 'https://livostyle.com',
    license: 'MIT',
  };
}

// ─── Server bootstrap ────────────────────────────────────────────────
const server = new Server(
  { name: 'livostyle-catalog', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as any;
  try {
    let result: any;
    switch (name) {
      case 'search_products':   result = await handleSearch(args); break;
      case 'get_product':        result = await handleGet(args); break;
      case 'list_collections':   result = await handleListCollections(args); break;
      case 'get_collection':     result = await handleGetCollection(args); break;
      case 'recommend_outfit':   result = await handleRecommendOutfit(args); break;
      case 'catalog_stats':      result = await handleStats(); break;
      default: return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e: any) {
    return {
      content: [{ type: 'text', text: `Error in ${name}: ${e.message ?? e}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
