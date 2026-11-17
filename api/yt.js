// YouTube metadata without an API key: playlist items, single video info, and (for curation) playlist search.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'ru,en;q=0.8',
  Cookie: 'CONSENT=YES+cb; SOCS=CAI',
};

async function initialData(url) {
  const r = await fetch(url, { headers: HEADERS });
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s) || html.match(/ytInitialData"\]\s*=\s*(\{.*?\});/s);
  if (!m) throw new Error('no data');
  return JSON.parse(m[1]);
}

function walk(o, fn) {
  if (!o || typeof o !== 'object') return;
  fn(o);
  for (const k in o) walk(o[k], fn);
}
const text = (t) => (t ? t.simpleText ?? t.content ?? (t.runs || []).map((r) => r.text).join('') : '');

async function playlist(id) {
  const d = await initialData(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}&hl=ru`);
  const items = [];
  let title = '', channel = '';
  walk(d, (o) => {
    if (o.playlistVideoRenderer?.videoId) {
      const v = o.playlistVideoRenderer;
      items.push({ id: v.videoId, title: text(v.title), seconds: Number(v.lengthSeconds) || 0 });
    }
    if (o.playlistMetadataRenderer && !title) title = o.playlistMetadataRenderer.title;
    if (o.playlistHeaderRenderer) { title = title || text(o.playlistHeaderRenderer.title); channel = channel || text(o.playlistHeaderRenderer.ownerText); }
    if (o.pageHeaderViewModel && !title) title = text(o.pageHeaderViewModel.title?.dynamicTextViewModel?.text);
  });
  if (!channel) walk(d, (o) => { if (!channel && o.videoOwnerRenderer) channel = text(o.videoOwnerRenderer.title); });
  if (!channel) walk(d, (o) => { if (!channel && o.playlistVideoRenderer) channel = text(o.playlistVideoRenderer.shortBylineText); });
  return { id, title, channel, items };
}

async function video(id) {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { headers: HEADERS });
  if (!r.ok) throw new Error('not found');
  const j = await r.json();
  return { id, title: j.title, channel: j.author_name };
}

async function search(q) {
  const d = await initialData(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAw%253D%253D&hl=ru`);
  const out = [];
  walk(d, (o) => {
    if (o.playlistRenderer?.playlistId) {
      const p = o.playlistRenderer;
      out.push({ id: p.playlistId, title: text(p.title), count: Number(p.videoCount) || 0, channel: text(p.shortBylineText) || text(p.longBylineText) });
    }
    if (o.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
      const l = o.lockupViewModel;
      const md = l.metadata?.lockupMetadataViewModel;
      const rows = [];
      walk(md?.metadata, (x) => { if (x.text?.content) rows.push(x.text.content); });
      const badge = [];
      walk(l.contentImage, (x) => { if (x.thumbnailBadgeViewModel?.text) badge.push(x.thumbnailBadgeViewModel.text); });
      out.push({ id: l.contentId, title: md?.title?.content || '', channel: rows[0] || '', count: parseInt(badge[0], 10) || 0 });
    }
  });
  return out;
}

export default async function handler(req, res) {
  const { list, v, q, k } = req.query;
  try {
    if (list) { res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400'); return res.json(await playlist(String(list))); }
    if (v) { res.setHeader('Cache-Control', 's-maxage=86400'); return res.json(await video(String(v))); }
    if (q && k && k === process.env.YT_SEARCH_KEY) return res.json(await search(String(q)));
    if (req.query.dbg && k && k === process.env.YT_SEARCH_KEY) {
      const d = await initialData(`https://www.youtube.com/playlist?list=${encodeURIComponent(String(req.query.dbg))}&hl=ru`);
      const keys = {}; let sample = null;
      const scan = (o, parent) => { if (!o || typeof o !== 'object') return; for (const kk in o) { const x = o[kk]; if (x && typeof x === 'object' && !Array.isArray(x) && (x.videoId || x.contentId)) { keys[kk] = (keys[kk] || 0) + 1; if (!sample) sample = JSON.stringify(x).slice(0, 3000); } scan(x, kk); } };
      scan(d);
      return res.json({ keys, sample });
    }
    res.status(400).json({ error: 'list, v or q required' });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
