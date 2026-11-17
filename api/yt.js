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
    // 2026 layout: each playlist entry is a lockupViewModel of type video.
    if (o.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && o.lockupViewModel.contentId) {
      const l = o.lockupViewModel;
      const badge = [];
      walk(l.contentImage, (x) => { if (x.thumbnailBadgeViewModel?.text) badge.push(x.thumbnailBadgeViewModel.text); });
      const seconds = /^\d+(:\d+)+$/.test(badge[0] || '') ? badge[0].split(':').reduce((a, n) => a * 60 + Number(n), 0) : 0;
      if (!items.some((x) => x.id === l.contentId)) items.push({ id: l.contentId, title: l.metadata?.lockupMetadataViewModel?.title?.content || '', seconds });
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

// The live stream from the Haram right now. The broadcaster's handle first, then a search among live videos.
const LIVE = {
  makkah: { ids: ['R-EaDtiQTk0'], handles: ['@SaudiQuranTv', '@saudiqurantv'], q: 'makkah live قناة القرآن الكريم بث مباشر', must: /mak|مك|قرآن|quran|haram|حرم/i },
  madinah: { handles: ['@SaudiSunnahTv', '@saudisunnahtv'], q: 'madinah live قناة السنة النبوية بث مباشر', must: /mad|med|مدين|سنة|sunnah|nabawi|نبوي/i },
};
async function live(place) {
  const c = LIVE[place] || LIVE.makkah;
  // The stream Nasim chose first; if it ended, the same channel's current live.
  for (const v of c.ids || []) {
    try {
      const html = await (await fetch(`https://www.youtube.com/watch?v=${v}`, { headers: HEADERS })).text();
      if (/"isLiveNow":true/.test(html)) return { id: v, via: 'chosen' };
      const ch = html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
      if (ch) {
        const live = await (await fetch(`https://www.youtube.com/channel/${ch}/live`, { headers: HEADERS })).text();
        const id = live.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
        if (id && /"isLiveNow":true/.test(live)) return { id, via: 'chosen-channel' };
      }
    } catch { /* fall through */ }
  }
  for (const h of c.handles) {
    try {
      const r = await fetch(`https://www.youtube.com/${h}/live`, { headers: HEADERS });
      const html = await r.text();
      const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
      if (id && /"isLive(Now|Content)":true/.test(html)) return { id, via: h };
    } catch { /* try the next one */ }
  }
  const d = await initialData(`https://www.youtube.com/results?search_query=${encodeURIComponent(c.q)}&sp=EgJAAQ%253D%253D`);
  let found = null;
  walk(d, (o) => {
    const v = o.videoRenderer;
    if (found || !v?.videoId) return;
    const t = text(v.title) + ' ' + text(v.ownerText);
    if (c.must.test(t)) found = { id: v.videoId, title: text(v.title), channel: text(v.ownerText), via: 'search' };
  });
  if (!found) throw new Error('no live');
  return found;
}

export default async function handler(req, res) {
  const { list, v, q, k, live: place } = req.query;
  try {
    if (place) { res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600'); return res.json(await live(String(place))); }
    if (list) { res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400'); return res.json(await playlist(String(list))); }
    if (v) { res.setHeader('Cache-Control', 's-maxage=86400'); return res.json(await video(String(v))); }
    if (q && k && k === process.env.YT_SEARCH_KEY) return res.json(await search(String(q)));
    res.status(400).json({ error: 'list, v or q required' });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
