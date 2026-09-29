// Telegram Mini App থেকে আসা ফাইল বটের মাধ্যমে ব্যবহারকারীর চ্যাটে পাঠায়।
// BOT_TOKEN Netlify-র Environment variables-এ রাখতে হবে (কোডে বা GitHub-এ নয়)।
const crypto = require('crypto');

const json = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const token = process.env.BOT_TOKEN;
  if (!token) return json(500, { error: 'সার্ভারে BOT_TOKEN সেট করা নেই' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'ভুল অনুরোধ' }); }

  const { initData, name, data } = body;
  if (!initData || !data) return json(400, { error: 'তথ্য অসম্পূর্ণ' });

  // Telegram initData যাচাই (শুধু আপনার বটের Mini App থেকে আসা অনুরোধ চলবে)
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (!hash || hash.length !== calc.length ||
      !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) {
    return json(403, { error: 'যাচাই ব্যর্থ। অ্যাপটি বটের ভেতর থেকে খুলুন।' });
  }
  const age = Date.now() / 1000 - Number(params.get('auth_date'));
  if (!(age < 86400)) return json(403, { error: 'সেশন পুরনো হয়ে গেছে। অ্যাপ বন্ধ করে আবার খুলুন।' });

  let user;
  try { user = JSON.parse(params.get('user') || '{}'); } catch { user = {}; }
  if (!user.id) return json(400, { error: 'ব্যবহারকারী পাওয়া যায়নি' });

  const buf = Buffer.from(String(data), 'base64');
  if (!buf.length) return json(400, { error: 'ফাইল খালি' });
  if (buf.length > 4.5 * 1024 * 1024) return json(413, { error: 'ফাইল ৪.৫ MB এর বেশি' });

  const fname = String(name || 'file').replace(/[^\w.\-]/g, '_').slice(0, 60);
  const fd = new FormData();
  fd.append('chat_id', String(user.id));
  fd.append('caption', '✅ আপনার ফাইল তৈরি হয়েছে');
  fd.append('document', new Blob([buf]), fname);

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
    const j = await r.json();
    if (!j.ok) {
      const msg = j.error_code === 403
        ? 'বটকে আগে /start দিন, তারপর আবার চেষ্টা করুন।'
        : 'Telegram-এ পাঠানো যায়নি।';
      return json(502, { error: msg });
    }
    return json(200, { ok: true });
  } catch {
    return json(502, { error: 'Telegram-এর সাথে যোগাযোগ করা যায়নি' });
  }
};
