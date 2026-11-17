// Living Muslim: anonymous visit counter (no cookies, no IP). Usage: <script src="/hit.js" data-page="landing" defer></script>
(function () {
  try {
    var s = document.currentScript, page = (s && s.getAttribute('data-page')) || 'landing';
    var ls = window.localStorage, vid = ls.getItem('lm.vid');
    if (!vid) { vid = (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 24); ls.setItem('lm.vid', vid); }
    var ref = '';
    try { var h = document.referrer && new URL(document.referrer).hostname.replace(/^www\./, ''); if (h && h !== location.hostname) ref = h; } catch (e) {}
    var q = new URLSearchParams(location.search), utm = q.get('utm_source') || q.get('ref') || q.get('src') || '';
    var w = Math.min(screen.width, screen.height), device = w < 600 ? 'mobile' : w < 1000 ? 'tablet' : 'desktop';
    var body = JSON.stringify({ vid: vid, page: page, ref: ref, utm: utm, device: device, lang: (navigator.language || '').slice(0, 2) });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/hit', new Blob([body], { type: 'application/json' }));
    else fetch('/api/hit', { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch (e) {}
})();
