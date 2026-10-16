import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 도메인은 확정 전 임시값입니다. 구매한 도메인으로 바꾸면 canonical·sitemap·OG가 함께 바뀝니다.
export default defineConfig({
  site: process.env.SITE_URL || 'https://chahyungjin.com',
  integrations: [sitemap()],
  build: { format: 'directory' },
  trailingSlash: 'ignore',
});
