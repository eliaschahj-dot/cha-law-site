import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeTables from './src/lib/rehype-tables.mjs';

// 2026.10.20 가비아에서 lawyer-cha.com 구매. Render SITE_URL 환경변수가 우선한다.
export default defineConfig({
  site: process.env.SITE_URL || 'https://www.lawyer-cha.com',
  integrations: [sitemap()],
  markdown: { rehypePlugins: [rehypeTables] },
  build: { format: 'directory' },
  trailingSlash: 'ignore',
  // 2026.10.16 상속 단일 전문으로 개편: 옛 주소는 새 랜딩 페이지로 보낸다. 2026.10.22 /real-estate 는 부동산 전문 하위 사이트로 다시 열었다.
  redirects: {
    '/about': '/inheritance-lawyer',
    '/inheritance/division': '/dispute',
    '/inheritance/debt': '/renunciation',
    '/inheritance/legal-reserve': '/legal-reserve',
    '/inheritance/guardianship': '/guardianship',
    '/inheritance/will': '/will',
    '/inheritance/registration': '/registration',
    '/inheritance/tax': '/tax',
  },
});
