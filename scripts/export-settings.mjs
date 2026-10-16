// 일회성: src/data/site.ts · areas.ts 의 데이터를 편집 가능한 JSON(src/content/site, src/content/areas)으로 내보낸다.
// 실행: node scripts/export-settings.mjs   (Node 24: TypeScript 타입 제거 기본 지원)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = await import(pathToFileURL(path.join(root, 'src/data/site.ts')).href);
const areas = await import(pathToFileURL(path.join(root, 'src/data/areas.ts')).href);

const siteDir = path.join(root, 'src/content/site');
const areaDir = path.join(root, 'src/content/areas');
mkdirSync(siteDir, { recursive: true });
mkdirSync(areaDir, { recursive: true });
const w = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');

w(path.join(siteDir, 'site.json'), site.site);
w(path.join(siteDir, 'trust.json'), { items: site.trust });
w(path.join(siteDir, 'bio.json'), site.bio);
w(path.join(siteDir, 'press.json'), { outlets: site.pressOutlets, items: site.press, activities: site.activities });
w(path.join(siteDir, 'faq.json'), { home: site.faq, fees: site.feeFaq });
for (const a of areas.areas) w(path.join(areaDir, `${a.axis === 're' ? 're' : 'in'}-${a.slug}.json`), a);
console.log('exported', areas.areas.length, 'areas +', 5, 'site files');
