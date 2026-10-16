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
  }),
});

export const collections = { columns, areas };
