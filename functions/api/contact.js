/**
 * Cloudflare Pages Function — POST /api/contact
 * 환경변수: RESEND_API_KEY (이메일 전송), CONTACT_TO (수신 주소), CONTACT_FROM (발신 주소, 인증된 도메인)
 * 키가 없으면 콘솔에 기록만 하고 ok를 돌려줍니다(개발·검수용).
 */
export async function onRequestPost({ request, env }) {
  let data = {};
  const ct = request.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) data = await request.json();
    else data = Object.fromEntries((await request.formData()).entries());
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  if (data.company) return json({ ok: true }); // 봇(허니팟)
  const name = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  const message = String(data.message || '').trim();
  const area = String(data.area || '').trim();
  const source = String(data.source || '').trim();
  if (!name || !phone || !message || !data.agree) return json({ ok: false, error: 'missing fields' }, 400);
  if (message.length > 4000) return json({ ok: false, error: 'too long' }, 400);

  const text = [
    `[상담 신청] ${area || '분야 미선택'}`,
    `성함: ${name}`,
    `연락처: ${phone}`,
    `유입 경로: ${source}`,
    '',
    message,
    '',
    `접수: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    `IP: ${request.headers.get('cf-connecting-ip') || ''}`,
  ].join('\n');

  if (env.RESEND_API_KEY && env.CONTACT_TO) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.CONTACT_FROM || 'onboarding@resend.dev',
        to: [env.CONTACT_TO],
        subject: `[홈페이지 상담] ${name} · ${area}`,
        text,
      }),
    });
    if (!r.ok) return json({ ok: false, error: 'mail failed' }, 502);
  } else {
    console.log('[contact] (no mail key)\n' + text);
  }
  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
