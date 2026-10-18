// 마크다운 표를 모바일에서 행 단위 카드로 바꿀 수 있도록 손보는 rehype 플러그인.
// - <table>을 <div class="tbl">로 감싼다(데스크톱에서 넓으면 가로 스크롤).
// - 2열 표는 t-kv(항목 | 내용), 3열 이상은 t-wide.
// - t-wide의 본문 칸에는 머리글 글자를 data-label로 넣어, 모바일에서 칸 위에 작게 표시한다.
const text = (n) => (n.type === 'text' ? n.value : (n.children || []).map(text).join(''));
const isEl = (n, tag) => n && n.type === 'element' && (!tag || n.tagName === tag);
const cells = (tr) => (tr.children || []).filter((c) => isEl(c, 'td') || isEl(c, 'th'));

export default function rehypeTables() {
  return (tree) => {
    const walk = (node, parent, index) => {
      if (isEl(node, 'table')) {
        const rows = [];
        const collect = (n) => {
          for (const c of n.children || []) {
            if (isEl(c, 'tr')) rows.push(c);
            else if (isEl(c)) collect(c);
          }
        };
        collect(node);
        const cols = Math.max(0, ...rows.map((r) => cells(r).length));
        const head = rows[0] ? cells(rows[0]).map((c) => text(c).trim()) : [];
        node.properties = node.properties || {};
        const cls = Array.isArray(node.properties.className) ? node.properties.className : [];
        cls.push(cols <= 2 ? 't-kv' : 't-wide');
        node.properties.className = cls;
        node.properties.dataCols = String(cols);
        if (cols >= 3) {
          for (const r of rows.slice(1)) {
            cells(r).forEach((c, i) => {
              if (isEl(c, 'td') && head[i] && text(c).trim()) c.properties = { ...(c.properties || {}), dataLabel: head[i] };
            });
          }
        }
        if (parent) parent.children[index] = { type: 'element', tagName: 'div', properties: { className: ['tbl'] }, children: [node] };
        return;
      }
      if (node.children) node.children.forEach((c, i) => walk(c, node, i));
    };
    walk(tree, null, 0);
  };
}
