import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 칼럼·꿀팁: src/content/columns/{id}.md — 네이버 동기화와 /admin 편집기가 함께 쓰는 원본
const columns = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/columns' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    section: z.string().default('비공개'),
    category: z.string().optional().default(''),
    categoryNo: z.coerce.number().optional().default(0),
    tags: z.array(z.string()).default([]),
    excerpt: z.string().optional().default(''),
    naverLogno: z.string().optional(),
    naverUrl: z.string().optional().default(''),
    source: z.string().optional().default('naver'),
    public: z.boolean().default(true),
    review: z.array(z.string()).default([]),
  }),
});

// 업무 분야 13개: src/content/areas/{axis}-{slug}.json
const areas = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/areas' }),
  schema: z.object({
    axis: z.enum(['re', 'in']),
    slug: z.string(),
    name: z.string(),
    short: z.string(),
    lead: z.string(),
    situations: z.array(z.string()),
    steps: z.array(z.object({ t: z.string(), d: z.string() })),
    docs: z.array(z.string()),
    faq: z.array(z.object({ q: z.string(), a: z.string() })),
    tags: z.array(z.string()).default([]),
    deadlines: z.array(z.object({ k: z.string(), v: z.string() })).default([]),
  }),
});

// 안내 페이지(절차 가이드·상황별 안내): src/content/guides/{slug}.json
const guides = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/guides' }),
  schema: z.object({
    slug: z.string(),
    kind: z.enum(['guide', 'situation']),
    site: z.enum(['in', 're']).default('in'), // in = 상속(/guide, /situations), re = 부동산(/real-estate/guide, /real-estate/situations)
    updated: z.string(),
    title: z.string(),
    seoTitle: z.string().optional(),
    desc: z.string(),
    eyebrow: z.string(),
    lead: z.string(),
    keywords: z.array(z.string()).default([]),
    areas: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    deadlines: z.array(z.object({ k: z.string(), v: z.string() })).default([]),
    sections: z.array(z.object({ h: z.string(), p: z.array(z.string()), list: z.array(z.string()).optional() })),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

export const collections = { columns, areas, guides };
