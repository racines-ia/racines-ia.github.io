/* cuervo.co — place de marché. Données : Supabase (tables mk_*). */
(function () {
'use strict';
var SB_URL = 'https://eebqtggnmuzfrwgunpsa.supabase.co';
var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnF0Z2dubXV6ZnJ3Z3VucHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NzI0NTQsImV4cCI6MjEwNzM0ODQ1NH0.tuCugIF_T1uVXXsWs96JwKJ1m_r-Pru477n7cP1sb1Y';
var sb = window.supabase.createClient(SB_URL, SB_KEY);
var OPS = { mpesa: 'M-Pesa', airtel: 'Airtel Money', orange: 'Orange Money' };
var REPORTS = [['Arnaque', 'Le vendeur a pris mon argent sans rien donner'], ['Je n\'ai pas reçu mon produit', 'J\'ai payé mais le lien ou le fichier n\'est jamais arrivé'], ['Le produit ne marche pas', 'Lien cassé, fichier vide ou application qui ne s\'ouvre pas'], ['Différent de la description', 'Ce que j\'ai reçu ne correspond pas à l\'annonce'], ['Produit copié ou volé', 'Le vendeur revend le travail de quelqu\'un d\'autre'], ['Contenu interdit ou choquant', 'Contenu illégal, violent ou pour adultes'], ['Le vendeur ne répond pas', 'Aucune réponse sur WhatsApp ni au téléphone'], ['Autre problème', 'Explique-le en quelques mots ci-dessous']];
var CATS = ['Formations', 'Fichiers et modèles', 'Applications et logiciels', 'Design et graphisme', 'Mode et beauté', 'Téléphones et électronique', 'Services', 'Autres'];
var S = { user: null, vendor: null, settings: null, tab: 'commandes', atab: 'signal', ctx: {}, orders: [], products: [], subs: [] };
var E = null;            // produit en cours d'édition
var rid = 0, pollT = null, armed = '';
var $ = function (id) { return document.getElementById(id); };
var app = $('app');
var MASCOT = '<svg class="masc" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB547"/><stop offset=".5" stop-color="#FF7A1A"/><stop offset="1" stop-color="#E8430F"/></linearGradient></defs>' +
  '<circle cx="60" cy="60" r="56" fill="url(#mg)"/><circle cx="60" cy="60" r="56" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>' +
  '<path d="M28 74c0-22 15-38 36-38 13 0 22 6 27 15l17 6-16 6c-3 17-15 29-32 29-19 0-32-7-32-18z" fill="#140D08"/>' +
  '<path d="M48 40l-6-14 11 9 2-15 6 16" fill="#140D08"/><path d="M91 51l17 6-16 6z" fill="#3A2416"/>' +
  '<circle cx="75" cy="55" r="7" fill="#fff"/><circle cx="76.5" cy="55" r="3.6" fill="#FF7A1A"/>' +
  '<path d="M96 22l2.4 6.6L105 31l-6.6 2.4L96 40l-2.4-6.6L87 31l6.6-2.4z" fill="#fff"/><path d="M40 82c8 5 20 6 30 2" stroke="#FF7A1A" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
function theme(t) { if (t) { try { localStorage.setItem('cv_theme', t); } catch (e) {} } else { try { t = localStorage.getItem('cv_theme'); } catch (e) {} } if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#FBF6F1' : '#0A0705';
  var b = $('hTheme'); if (b) { b.innerHTML = ico(t === 'light' ? 'i-moon' : 'i-sun'); b.setAttribute('aria-label', t === 'light' ? 'Mode sombre' : 'Mode jour'); } }
theme();
(function () {
  var sp = $('splash'); if (!sp) return;
  var seen = false, now = Date.now();
  try {
    var nv = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    seen = (nv && nv.type === 'reload') || now - Number(localStorage.getItem('cv_splash') || 0) < 6 * 3600 * 1000 || !!localStorage.getItem('cv_draft');
    localStorage.setItem('cv_splash', String(now));
  } catch (e) {}
  if (seen) { sp.remove(); return; }
  var t, done = function () { clearTimeout(t); sp.classList.add('out'); setTimeout(function () { sp.remove(); }, 650); };
  t = setTimeout(done, 10000);
  sp.addEventListener('click', done);
})();

/* ---------- Outils ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ico(n, st) { return '<svg class="i"' + (st ? ' style="' + st + '"' : '') + '><use href="#' + n + '"/></svg>'; }
function safeUrl(u) { u = String(u || '').trim(); return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
function money(n, dev) {
  n = Number(n) || 0;
  var t = (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return dev === 'CDF' ? t + ' FC' : t + ' $';
}
function waNum(v) { var d = String(v || '').replace(/\D/g, ''); if (d.length === 10 && d.charAt(0) === '0') d = '243' + d.slice(1); else if (d.length === 9) d = '243' + d; return d; }
function fmtDate(d) { try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return String(d); } }
function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 3000); }
function pic(u, label) {
  u = safeUrl(u);
  return u ? '<img class="f" loading="lazy" src="' + esc(u) + '" alt="" onload="this.classList.add(\'ld\')">' : '<div class="ph"><div>' + ico('i-img') + (label || '') + '</div></div>';
}
function avatar(shop, cls) {
  var u = safeUrl(shop.avatar_url);
  return '<div class="av ' + (cls || '') + '">' + (u ? '<img class="f" src="' + esc(u) + '" alt="" onload="this.classList.add(\'ld\')">' : esc((shop.boutique || '?').charAt(0).toUpperCase())) + '</div>';
}
function link(q) { return location.origin + location.pathname + (q || ''); }
function plink(id) { return location.origin + location.pathname.replace(/index\.html$/, '') + 'p/' + id + '/'; }
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function busy(btn, on, label) { if (!btn) return; btn.disabled = on; btn.classList.toggle('busy', on); if (label) btn.lastChild.textContent = label; }
function errMsg(e) {
  var m = (e && (e.message || e.error_description)) || '';
  if (/Invalid login/i.test(m)) return 'Numéro ou mot de passe incorrect.';
  if (/already registered/i.test(m)) return 'Ce numéro a déjà un compte. Connecte-toi.';
  if (/Password should/i.test(m)) return 'Le mot de passe doit avoir au moins 6 caractères.';
  if (/NotReadable|not.?readable|could not be read|espace|space|ENOSPC/i.test(m) || (e && e.name === 'NotReadableError')) return 'Ton téléphone n\'a pas pu lire ce fichier : il manque sans doute d\'espace. Libère un peu de place (ou vide le cache de Chrome), puis réessaie.';
  if (/mime|invalid_mime|type.*not supported/i.test(m)) return 'Format de fichier non accepté.';
  if (/size|exceeded|too large|Payload/i.test(m)) return 'Fichier trop lourd : 50 Mo maximum.';
  if (/fetch|network/i.test(m)) return 'Connexion internet instable. Réessaie.';
  return m || 'Une erreur est survenue. Réessaie.';
}
function setBar(html) { $('bar').classList.toggle('hide', !html); document.body.classList.toggle('has-bar', !!html); $('barIn').innerHTML = html || ''; }
function sheet(html) { $('sheetBody').innerHTML = html; $('sheetRoot').classList.add('open'); $('sheetRoot').querySelector('.sheet').scrollTop = 0; }
function closeSheet() { $('sheetRoot').classList.remove('open'); E = null; }
(function () {
  var sh = document.querySelector('#sheetRoot .sheet'), y0 = 0, dy = 0, drag = false, t0 = 0;
  if (!sh) return;
  sh.addEventListener('touchstart', function (e) { if (sh.scrollTop > 0) return; drag = true; y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); sh.style.transition = 'none'; }, { passive: true });
  sh.addEventListener('touchmove', function (e) { if (!drag) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0 && sh.scrollTop <= 0) sh.style.transform = 'translateY(' + (dy < 0 ? 0 : dy) + 'px)'; else if (dy <= 0) drag = false; }, { passive: true });
  sh.addEventListener('touchend', function () { if (!drag) return; drag = false; sh.style.transition = ''; var v = dy / Math.max(1, Date.now() - t0); sh.style.transform = ''; if (dy > 120 || v > 0.6) closeSheet(); });
})();
function keepDraft() { try { if (E) { edRead(); localStorage.setItem('cv_draft', JSON.stringify({ t: Date.now(), id: E.id, p: E.p })); window.addEventListener('focus', function () { setTimeout(dropDraft, 2500); }, { once: true }); } } catch (e) {} }
function dropDraft() { try { localStorage.removeItem('cv_draft'); } catch (e) {} }
function takeDraft() { try { var d = JSON.parse(localStorage.getItem('cv_draft') || 'null'); dropDraft(); return d && Date.now() - d.t < 20 * 60 * 1000 ? d : null; } catch (e) { return null; } }
document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('input[type=file]') && E) keepDraft(); }, true);
var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, revObs = null;
function reveal() {
  if (RM || !('IntersectionObserver' in window)) return;
  if (!revObs) revObs = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); revObs.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  var vh = innerHeight;
  app.querySelectorAll('.sec, .grid > .card, .ord, .box, .avis, .ex, .rv').forEach(function (el) {
    if (el.getBoundingClientRect().top > vh * 0.92) { el.classList.add('rv'); revObs.observe(el); }
  });
}
function page(html) {
  /* même écran (choix, onglet, enregistrement) : on garde la position, sans animation d'entrée */
  var same = page.last === location.href && !!app.querySelector('.page'), y = window.scrollY;
  page.last = location.href;
  var go = function () { app.innerHTML = '<div class="page' + (same ? ' still' : '') + '">' + html + '</div>'; window.scrollTo({ top: same ? y : 0, behavior: 'instant' }); tick(); countUp(same); if (!same) reveal(); };
  if (same) return go();
  if (!RM && document.startViewTransition && !page.busy && app.querySelector('.page:not(.g16)')) { page.busy = true; var t = document.startViewTransition(go); t.finished.then(function () { page.busy = false; }, function () { page.busy = false; }); }
  else go();
}
function skeleton() { setBar(null); app.innerHTML = '<div class="page g16"><div class="sk" style="aspect-ratio:16/9"></div><div class="sk" style="height:28px;width:70%"></div><div class="sk" style="height:16px;width:90%"></div><div class="grid"><div class="sk" style="aspect-ratio:3/4"></div><div class="sk" style="aspect-ratio:3/4"></div></div></div>'; }
function notFound(msg) { setBar(null); page('<div class="empty" style="margin-top:40px"><h2 style="margin-bottom:8px">Introuvable</h2><p>' + esc(msg) + '</p><a class="btn btn-ghost btn-sm" style="margin-top:16px" href="./" data-nav>Retour à l\'accueil</a></div>'); }
function tokens() { try { var a = JSON.parse(localStorage.getItem('cv_orders') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function addToken(t) { try { var a = tokens().filter(function (x) { return x !== t; }); a.unshift(t); localStorage.setItem('cv_orders', JSON.stringify(a.slice(0, 30))); } catch (e) {} header(); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function tick() {
  document.querySelectorAll('.cd').forEach(function (el) {
    var ms = Number(el.dataset.end) - Date.now();
    if (ms <= 0) { el.closest('.promo-box') && el.closest('.promo-box').remove(); return; }
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    el.innerHTML = '<div><b>' + d + '</b><span>jours</span></div><div><b>' + pad(h) + '</b><span>heures</span></div><div><b>' + pad(m) + '</b><span>min</span></div><div><b>' + pad(s % 60) + '</b><span>sec</span></div>';
  });
}
setInterval(tick, 1000);
function countUp(now) {
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var to = Number(el.dataset.count) || 0, t0 = null; el.removeAttribute('data-count');
    if (now || to < 2 || window.matchMedia('(prefers-reduced-motion:reduce)').matches) { el.textContent = to; return; }
    function f(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / 300); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  });
}
function tabnav() {
  var q = new URLSearchParams(location.search), v = q.get('v'), cur = v === 'compte' || v === 'admin' ? 'shop' : v === 'achats' ? 'buy' : v === 'ia' ? 'ia' : v === 'aide' ? 'aide' : (q.get('p') || q.get('b') || q.get('c')) ? '' : 'home';
  var it = function (k, href, icn, label) { return '<a class="' + (cur === k ? 'on' : '') + '" href="' + href + '" data-nav>' + ico(icn) + label + '</a>'; };
  $('tabnav').innerHTML = '<div class="in">' + it('home', './', 'i-home', 'Accueil') + '<a class="' + (cur === 'ia' ? 'on' : '') + '" href="?v=ia" data-nav><span class="ia-ico">' + ico('i-cuervo') + '</span>Cuervo IA</a>' + it('buy', '?v=achats', 'i-bag', 'Mes achats') + it('shop', '?v=compte', 'i-store', S.vendor ? 'Ma boutique' : 'Vendre') + '</div>';
}
function header() {
  tabnav();
  var hb = $('hAccount'); hb.classList.toggle('logo', !!S.vendor); hb.setAttribute('aria-label', S.vendor ? 'Ma boutique' : 'Vendre'); hb.innerHTML = S.vendor ? avatar(S.vendor) : ico('i-store') + 'Vendre';
  $('hOrders').classList.add('hide'); $('hOrders').innerHTML = ico('i-bag');
}

/* ---------- Photos et fichiers ---------- */
function toJpeg(file, W, H, crop) {
  function draw(src, iw, ih) {
    var w = W, h = H, s;
    if (crop) s = Math.max(W / iw, H / ih);
    else { s = Math.min(1, W / iw, H / ih); w = Math.round(iw * s); h = Math.round(ih * s); }
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
    return new Promise(function (res, rej) { c.toBlob(function (b) { c.width = c.height = 0; b ? res(b) : rej(new Error('Image illisible')); }, 'image/jpeg', .84); });
  }
  if (!file || !file.size) return Promise.reject(Object.assign(new Error('NotReadable'), { name: 'NotReadableError' }));
  var viaImg = function () {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { draw(im, im.naturalWidth, im.naturalHeight).then(res, rej).then(function () { URL.revokeObjectURL(url); }); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Image illisible : choisis une photo JPG ou PNG.')); };
      im.src = url;
    });
  };
  if (!window.createImageBitmap) return viaImg();
  // Décode à une taille réduite : évite de charger une grosse photo entière en mémoire
  return createImageBitmap(file).then(function (full) {
    var k = Math.max(W / full.width, H / full.height) * 1.5, iw = full.width, ih = full.height;
    if (k >= 1) return draw(full, iw, ih).then(function (b) { full.close(); return b; });
    full.close();
    return createImageBitmap(file, { resizeWidth: Math.round(iw * k), resizeHeight: Math.round(ih * k), resizeQuality: 'high' })
      .then(function (bm) { return draw(bm, bm.width, bm.height).then(function (b) { bm.close(); return b; }); });
  }).catch(function (e) { if (e && e.name === 'NotReadableError') throw e; return viaImg(); });
}
function rnd() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
var XHR = null;
function progress(label, pct) {
  var el = $('prog');
  if (pct == null) { el.classList.remove('on'); return; }
  el.classList.add('on');
  el.querySelector('.pl').textContent = label;
  el.querySelector('.pp').textContent = Math.round(pct) + ' %';
  el.querySelector('.pf').style.transform = 'scaleX(' + Math.max(0, Math.min(1, pct / 100)) + ')';
}
function loadTus() {
  if (window.tus) return Promise.resolve(window.tus);
  return new Promise(function (res, rej) {
    var sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tus-js-client@4/dist/tus.min.js';
    sc.onload = function () { window.tus ? res(window.tus) : rej(new Error('Envoi indisponible')); };
    sc.onerror = function () { rej(new Error('Connexion internet instable. Réessaie.')); };
    document.head.appendChild(sc);
  });
}
async function uploadBig(bucket, path, blob, type, label, tok) {
  var tus = await loadTus();
  progress(label, 0);
  await new Promise(function (res, rej) {
    var up = new tus.Upload(blob, {
      endpoint: SB_URL.replace('.supabase.co', '.storage.supabase.co') + '/storage/v1/upload/resumable',
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      headers: { authorization: 'Bearer ' + tok, apikey: SB_KEY, 'x-upsert': 'false' },
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      metadata: { bucketName: bucket, objectName: path, contentType: type || 'application/octet-stream', cacheControl: '31536000' },
      chunkSize: 6 * 1024 * 1024,
      onProgress: function (sent, total) { progress(label + ' · reprise auto', sent / total * 99); },
      onError: function (err) { var m = String(err && err.message || err); rej(new Error(/413|exceeded|too large/i.test(m) ? 'size exceeded' : /mime/i.test(m) ? 'invalid_mime' : 'Connexion interrompue : réessaie, l\'envoi reprendra où il s\'est arrêté.')); },
      onSuccess: function () { res(); }
    });
    XHR = { abort: function () { up.abort(true).catch(function () {}); rej(new Error('Envoi annulé.')); } };
    up.findPreviousUploads().then(function (prev) { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start(); });
  });
}
async function upload(bucket, path, blob, type, label) {
  if (!blob || !blob.size) throw Object.assign(new Error('NotReadable'), { name: 'NotReadableError' });
  var ses = (await sb.auth.getSession()).data.session, tok = ses ? ses.access_token : SB_KEY;
  label = label || 'Envoi en cours';
  progress(label, 0);
  try {
    var big = false;
    if (blob.size > 6 * 1024 * 1024) {
      try { await uploadBig(bucket, path, blob, type, label, tok); big = true; }
      catch (e) { if (/annulé|size|mime/i.test(e.message)) throw e; console.warn('tus', e); progress(label, 0); }
    }
    if (big) { progress(label, 100); return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl; }
    await new Promise(function (res, rej) {
      var x = XHR = new XMLHttpRequest();
      x.open('POST', SB_URL + '/storage/v1/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'));
      x.setRequestHeader('Authorization', 'Bearer ' + tok);
      x.setRequestHeader('apikey', SB_KEY);
      x.setRequestHeader('Content-Type', type || 'application/octet-stream');
      x.setRequestHeader('x-upsert', 'false');
      x.setRequestHeader('cache-control', 'max-age=31536000');
      x.upload.onprogress = function (e) { if (e.lengthComputable) progress(label, e.loaded / e.total * 99); };
      x.onload = function () { if (x.status >= 200 && x.status < 300) res(); else { var m = ''; try { m = JSON.parse(x.responseText).message; } catch (e) {} rej(new Error(m || 'Envoi refusé (' + x.status + ')')); } };
      x.onerror = function () { rej(new Error('Connexion internet instable. Réessaie.')); };
      x.onabort = function () { rej(new Error('Envoi annulé.')); };
      x.send(blob);
    });
    progress(label, 100);
  } finally { XHR = null; setTimeout(function () { progress(null, null); }, 500); }
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
function download(url, name) {
  progress('Téléchargement de ' + name, 0);
  var x = XHR = new XMLHttpRequest();
  x.open('GET', url); x.responseType = 'blob';
  x.onprogress = function (e) { if (e.lengthComputable) progress('Téléchargement de ' + name, e.loaded / e.total * 100); };
  x.onload = function () {
    XHR = null;
    if (x.status < 200 || x.status >= 300) { progress(null, null); window.open(url, '_blank'); return; }
    progress('Téléchargement de ' + name, 100);
    var a = document.createElement('a'), u = URL.createObjectURL(x.response);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
    setTimeout(function () { progress(null, null); toast('Téléchargement terminé'); }, 600);
  };
  x.onerror = function () { XHR = null; progress(null, null); window.open(url, '_blank'); };
  x.onabort = function () { XHR = null; progress(null, null); toast('Téléchargement annulé'); };
  x.send();
}
async function upImage(file, W, H, crop) { var b = await toJpeg(file, W, H, crop); return upload('mk-media', S.user.id + '/' + rnd() + '.jpg', b, 'image/jpeg', 'Envoi de la photo'); }

function videoMeta(f) {
  return new Promise(function (res) {
    var v = document.createElement('video'), u = URL.createObjectURL(f), fin = false, done = function (r) { if (fin) return; fin = true; URL.revokeObjectURL(u); res(r); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = function () { done({ ok: true, w: v.videoWidth, h: v.videoHeight, d: v.duration }); };
    v.onerror = function () { done({ ok: false, w: 16, h: 9, d: 0 }); };
    setTimeout(function () { done({ ok: false, w: 16, h: 9, d: 0 }); }, 8000);
    v.src = u;
  });
}
// Compression dans le téléphone : relit la vidéo et la réenregistre à un débit plus faible (dure à peu près la longueur de la vidéo)
function compressVideo(f, meta) {
  return new Promise(function (res, rej) {
    var types = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    var mime = window.MediaRecorder && types.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0];
    var v = document.createElement('video');
    if (!mime || !v.captureStream) return rej(new Error('Vidéo trop lourde : 50 Mo maximum, et ce téléphone ne peut pas la compresser. Mets-la sur YouTube et colle le lien.'));
    if (meta.d > 600) return rej(new Error('Vidéo trop longue pour être compressée ici (10 min max). Mets-la sur YouTube et colle le lien.'));
    var bits = Math.max(400000, Math.min(2500000, Math.floor((40 * 8 * 1024 * 1024) / Math.max(1, meta.d)) - 96000));
    var u = URL.createObjectURL(f), chunks = [], rec, cancelled = false;
    v.src = u; v.playsInline = true; v.volume = 0.0001;
    v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px';
    document.body.appendChild(v);
    var clean = function () { URL.revokeObjectURL(u); v.remove(); XHR = null; };
    XHR = { abort: function () { cancelled = true; try { rec && rec.stop(); } catch (e) {} v.pause(); clean(); progress(null, null); rej(new Error('Compression annulée.')); } };
    progress('Compression de la vidéo', 0);
    v.onloadeddata = function () {
      var st = v.captureStream();
      rec = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: bits, audioBitsPerSecond: 96000 });
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () { if (cancelled) return; clean(); res(new Blob(chunks, { type: mime.split(';')[0] })); };
      v.ontimeupdate = function () { if (meta.d) progress('Compression de la vidéo', v.currentTime / meta.d * 100); };
      v.onended = function () { try { rec.stop(); } catch (e) {} };
      rec.start(1000);
      v.play().catch(function () { clean(); progress(null, null); rej(new Error('Impossible de lire la vidéo pour la compresser.')); });
    };
    v.onerror = function () { clean(); progress(null, null); rej(new Error('Vidéo illisible sur ce téléphone.')); };
  });
}

/* ---------- Navigation ---------- */
function nav(q) { history.pushState({}, '', q || location.pathname); route(); }
window.addEventListener('popstate', function () { if (closeZoom(true)) return; route(); });
async function route() {
  var my = ++rid, alive = function () { return my === rid; };
  clearInterval(pollT); closeSheet(); armed = '';
  var q = new URLSearchParams(location.search), v = q.get('v');
  try { if (v !== 'compte' && localStorage.getItem('cv_draft')) { history.replaceState({}, '', '?v=compte'); v = 'compte'; q = new URLSearchParams('?v=compte'); } } catch (e) {}
  tabnav();
  try {
    if (q.get('p')) return await pageProduct(q.get('p'), alive);
    if (q.get('b')) return await pageShop(q.get('b'), alive);
    if (q.get('c')) return await pageOrder(q.get('c'), alive);
    if (v === 'compte') return await pageAccount(alive);
    if (v === 'admin') return await pageAdmin(alive);
    if (v === 'achats') return await pagePurchases(alive);
    if (v === 'ia') return await pageIA(alive);
    if (v === 'aide') return pageAide();
    return await pageHome(alive);
  } catch (e) { if (alive()) notFound(errMsg(e)); }
}

/* ---------- Accueil ---------- */
function card(p) {
  return '<a class="card" href="?p=' + esc(p.id) + '" data-nav><div class="sq">' + (p.promo ? '<span class="flag badge">−' + Math.round((1 - p.prix_actuel / p.prix) * 100) + ' %</span>' : '') + pic(p.image_url) + '<span class="pchip">' + money(p.prix_actuel, p.devise) + '</span></div><div class="b">' +
    (p.promo && p.promo_places != null ? '<div class="stock">Plus que ' + p.promo_places + ' place' + (p.promo_places > 1 ? 's' : '') + '</div>' : p.promo ? '<div class="stock"><s style="color:var(--muted)">' + money(p.prix, p.devise) + '</s></div>' : '') +
    '<h3>' + esc(p.titre) + '</h3>' +
    '<div class="m">' + (p.ventes > 0 ? p.ventes + ' vendu' + (p.ventes > 1 ? 's' : '') : 'Nouveau') + (p.boutique ? ' · ' + esc(p.boutique) : '') + '</div></div></a>';
}
function sellCta(loyer) {
  return '<div class="cta sec"><div class="kicker">Vendeurs</div><h2>Ouvre ta boutique en ligne</h2><p class="lead" style="margin:8px 0 16px">Publie tes produits, partage ton lien sur WhatsApp et Facebook, et reçois tes paiements par Mobile Money. Loyer : ' + money(loyer, 'CDF') + ' pour 40 jours.</p>' +
    '<a class="btn btn-primary" href="?v=compte" data-nav>' + (S.vendor ? 'Gérer ma boutique' : 'Créer ma boutique') + ' ' + ico('i-arrow') + '</a></div>';
}
var ILLU = {
  shop: '<svg viewBox="0 0 120 90" fill="none"><rect x="14" y="30" width="92" height="52" rx="8" fill="#2A1C12"/><path d="M10 30l10-18h80l10 18" stroke="#FFB547" stroke-width="3" stroke-linejoin="round"/><path d="M10 30h100v6a10 10 0 0 1-20 0 10 10 0 0 1-20 0 10 10 0 0 1-20 0 10 10 0 0 1-20 0 10 10 0 0 1-20 0z" fill="#FF7A1A"/><rect x="48" y="52" width="24" height="30" rx="4" fill="#07100B"/><rect x="24" y="48" width="16" height="14" rx="3" fill="#E8430F"/><rect x="80" y="48" width="16" height="14" rx="3" fill="#E8430F"/><circle cx="66" cy="68" r="2" fill="#FFB547"/></svg>',
  share: '<svg viewBox="0 0 120 90" fill="none"><rect x="36" y="6" width="48" height="80" rx="10" fill="#2A1C12" stroke="#E8430F" stroke-width="3"/><rect x="44" y="18" width="32" height="24" rx="4" fill="#FF7A1A"/><rect x="44" y="48" width="24" height="4" rx="2" fill="#A3B3A7"/><rect x="44" y="56" width="18" height="4" rx="2" fill="#A3B3A7"/><circle cx="16" cy="30" r="9" fill="#FFB547"/><circle cx="104" cy="22" r="9" fill="#E8430F"/><circle cx="104" cy="64" r="9" fill="#FF7A1A"/><path d="M25 30h11M84 30l11-6M84 56l11 6" stroke="#FFB547" stroke-width="3" stroke-linecap="round"/></svg>',
  pay: '<svg viewBox="0 0 120 90" fill="none"><rect x="10" y="22" width="70" height="48" rx="8" fill="#2A1C12" stroke="#E8430F" stroke-width="3"/><rect x="10" y="32" width="70" height="8" fill="#E8430F"/><rect x="20" y="52" width="22" height="6" rx="3" fill="#A3B3A7"/><circle cx="90" cy="54" r="22" fill="#FFB547"/><path d="M80 54l7 7 13-14" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  files: '<svg viewBox="0 0 120 90" fill="none"><path d="M34 8h34l18 18v56H34z" fill="#2A1C12" stroke="#E8430F" stroke-width="3" stroke-linejoin="round"/><path d="M68 8v18h18" stroke="#E8430F" stroke-width="3" stroke-linejoin="round"/><rect x="44" y="40" width="32" height="4" rx="2" fill="#A3B3A7"/><rect x="44" y="50" width="24" height="4" rx="2" fill="#A3B3A7"/><circle cx="88" cy="66" r="16" fill="#FF7A1A"/><path d="M88 58v14M82 66l6 6 6-6" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
function feature(k, t, d) { return '<div class="feat"><div class="fill">' + ILLU[k] + '</div><div><h3>' + t + '</h3><p>' + d + '</p></div></div>'; }
function homeCats() {
  var h = S.ctx.home, used = CATS.filter(function (c) { return h.ps.some(function (p) { return p.categorie === c; }); });
  if (!used.length) return '';
  return '<div class="pills" style="margin-top:12px">' + [''].concat(used).map(function (c) { return '<button class="pill' + (h.cat === c ? ' on' : '') + '" type="button" data-act="cat" data-id="' + esc(c) + '">' + (c || 'Tout') + '</button>'; }).join('') + '</div>';
}
function homeGrid() {
  var h = S.ctx.home, q = norm(h.q).trim();
  var list = h.ps.filter(function (p) { return (!h.cat || p.categorie === h.cat) && (!q || norm(p.titre + ' ' + (p.boutique || '') + ' ' + (p.categorie || '')).indexOf(q) >= 0); });
  return list.length ? '<div class="grid" style="margin-top:16px">' + list.map(card).join('') + '</div>' : '<div class="empty" style="margin-top:16px">Aucun produit ne correspond à ta recherche.</div>';
}
document.addEventListener('input', function (e) { if (e.target.id === 'h-q' && S.ctx.home) { S.ctx.home.q = e.target.value; $('homeGrid').innerHTML = homeGrid(); } });
async function pageHome(alive) {
  skeleton();
  var r = await sb.rpc('mk_home'); if (!alive()) return;
  if (r.error) throw r.error;
  var d = r.data || { products: [], loyer: 15000 }, ps = d.products || [];
  S.ctx.home = { ps: ps, q: '', cat: '' };
  var top = ps.filter(function (p) { return p.ventes > 0; }).sort(function (a, b) { return b.ventes - a.ventes; }).slice(0, 4);
  var pr = ps.filter(function (p) { return p.promo; }).sort(function (a, b) { return (1 - b.prix_actuel / b.prix) - (1 - a.prix_actuel / a.prix); })[0];
  page((pr ? '<a class="promo-hero" href="?p=' + esc(pr.id) + '" data-nav><div><h2>−' + Math.round((1 - pr.prix_actuel / pr.prix) * 100) + ' % sur ' + esc(pr.titre.length > 34 ? pr.titre.slice(0, 32) + '…' : pr.titre) + '</h2><p>Offre limitée · ' + money(pr.prix_actuel, pr.devise) + ' au lieu de ' + money(pr.prix, pr.devise) + '</p><span class="go">' + ico('i-bag', 'width:16px;height:16px') + 'J\'en profite</span></div><div class="pi">' + (safeUrl(pr.image_url) ? '<img src="' + esc(safeUrl(pr.image_url)) + '" alt="">' : '') + '</div></a><div style="height:28px"></div>' : '') + '<div class="hero2"><div class="kicker">Boutiques en ligne</div><h1>Vends facilement en ligne, encaisse par <span class="gt">Mobile Money</span>.</h1>' +
    '<p class="lead" style="margin-top:12px">Ouvre ta boutique, publie tes produits et partage leur lien sur WhatsApp et Facebook. Tes clients paient, tu confirmes, ils reçoivent leur achat.</p>' +
    '<div class="g8" style="margin-top:20px"><a class="btn btn-primary" href="?v=compte" data-nav><span>' + (S.vendor ? 'Ma boutique' : 'Ouvrir ma boutique') + '</span></a><button class="btn btn-ghost" type="button" data-act="toProducts"><span>Voir les produits</span></button></div></div>' +
    '<div class="sec"><div class="kicker">Comment ça marche</div><h2 style="margin-bottom:16px">Tout ce qu\'il faut pour vendre</h2><div class="g12 stag">' +
    '<a class="keyline" href="?v=aide" data-nav>cuervo.co ne garde aucune somme : tout va sur les numéros Mobile Money du vendeur, sauf le loyer. Voir comment ça marche →</a>' +
    feature('shop', 'Ta boutique en quelques minutes', 'Ton nom, ta photo, tes numéros Mobile Money : ta boutique est prête.') +
    feature('share', 'Un lien par produit', 'Partage-le sur WhatsApp ou Facebook : le client arrive directement sur ton produit.') +
    feature('pay', 'Paiement par Mobile Money', 'M-Pesa, Airtel Money ou Orange Money. Le client envoie sa capture, tu confirmes.') +
    feature('files', 'Livraison immédiate', 'Tu colles ton lien de téléchargement : le client y accède dès que tu confirmes son paiement.') +
    '</div></div>' +
    (top.length ? '<div class="sec"><div class="kicker">Les plus vendus</div><h2 style="margin-bottom:16px">Produits phares</h2><div class="grid stag">' + top.map(card).join('') + '</div></div>' : '') +
    '<div class="sec" id="produits"><div class="kicker">Catalogue</div><h2 style="margin-bottom:12px">Tous les produits</h2>' +
    (ps.length ? '<label class="search">' + ico('i-search') + '<input id="h-q" type="search" placeholder="Chercher un produit ou une boutique" autocomplete="off"></label><div id="homeCats">' + homeCats() + '</div><div id="homeGrid">' + homeGrid() + '</div>'
      : '<div class="empty">Aucun produit en ligne pour l\'instant. Sois le premier à ouvrir ta boutique.</div>') + '</div>' + sellCta(d.loyer));
}

/* ---------- Cuervo IA ---------- */
var IA = { msgs: [], busy: false, ps: null };
async function iaProducts() { if (IA.ps) return IA.ps; var r = await sb.rpc('mk_home'); IA.ps = (r.data && r.data.products) || []; return IA.ps; }
function iaRender() {
  var box = $('chat'); if (!box) return;
  box.innerHTML = IA.msgs.map(function (m) {
    if (m.role === 'me') return '<div class="msg me">' + esc(m.text) + '</div>';
    var cards = (m.produits || []).map(function (id) { return (IA.ps || []).filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    return '<div class="msg ia"><div class="who">' + MASCOT + 'Cuervo IA</div>' + esc(m.text) + (cards.length ? '<div class="grid">' + cards.map(card).join('') + '</div>' : '') + '</div>';
  }).join('') + (IA.busy ? '<div class="msg ia"><div class="who">' + MASCOT + 'Cuervo IA</div><span class="dots"><i></i><i></i><i></i></span></div>' : '');
  window.scrollTo(0, document.body.scrollHeight);
}
async function iaAsk(text) {
  text = String(text || '').trim(); if (!text || IA.busy) return;
  IA.msgs.push({ role: 'me', text: text }); IA.busy = true; iaRender();
  var inp = $('ia-q'); if (inp) inp.value = '';
  try {
    await iaProducts();
    var r = await sb.functions.invoke('mk-assistant', { body: { messages: IA.msgs.filter(function (m) { return !m.err; }).map(function (m) { return { role: m.role === 'me' ? 'user' : 'ia', text: m.text }; }) } });
    var d = r.data, m = d && d.error;
    if (!m && r.error) { try { m = (await r.error.context.json()).error; } catch (e) {} }
    if (d && d.reponse) IA.msgs.push({ role: 'ia', text: d.reponse, produits: d.produits || [] });
    else IA.msgs.push({ role: 'ia', err: true, text: m || 'Cuervo IA n\'est pas disponible pour le moment. Réessaie dans un instant.' });
  } catch (e) { IA.msgs.push({ role: 'ia', err: true, text: 'Connexion internet instable. Réessaie.' }); }
  IA.busy = false; iaRender();
}
async function pageIA() {
  setBar(null);
  page('<div class="ia-head">' + MASCOT + '<h1>Cuervo IA</h1><p class="lead">Ton guide sur cuervo.co : je t\'aide à trouver le bon produit, à comparer les prix et à comprendre comment acheter ou vendre.</p>' +
    (IA.msgs.length ? '' : '<div class="ia-sugg">' + ['Quels sont les produits les moins chers ?', 'Je veux apprendre à créer une application', 'Quelles sont les promos du moment ?', 'Comment acheter un produit ?', 'Comment ouvrir ma boutique ?'].map(function (q) { return '<button type="button" data-act="iaSugg">' + q + '</button>'; }).join('') + '</div>') +
    '</div><div class="chat" id="chat"></div>' +
    '<form class="ia-bar" id="iaForm"><div class="in"><input id="ia-q" maxlength="600" autocomplete="off" placeholder="Pose ta question à Cuervo IA…"><button type="submit" aria-label="Envoyer">' + ico('i-arrow') + '</button></div></form>');
  iaRender(); iaProducts().catch(function () {});
}
document.addEventListener('submit', function (e) { if (e.target.id === 'iaForm') { e.preventDefault(); iaAsk($('ia-q').value); } });

/* ---------- Vidéo de présentation (15 s) ---------- */
var VX_ART = {
  shop: '<svg viewBox="0 0 160 120"><rect x="20" y="44" width="120" height="66" rx="10" fill="#2A1C12"/><path d="M14 44l14-24h104l14 24z" fill="#FF7A1A"/><rect x="66" y="72" width="28" height="38" rx="4" fill="#0A0705"/><rect x="32" y="64" width="22" height="18" rx="4" fill="#FFB547"/><rect x="106" y="64" width="22" height="18" rx="4" fill="#FFB547"/></svg>',
  mm: '<svg viewBox="0 0 160 120"><rect x="46" y="6" width="68" height="108" rx="14" fill="#2A1C12" stroke="#FF7A1A" stroke-width="3"/><rect x="58" y="24" width="44" height="12" rx="4" fill="#FFB547"/><rect x="58" y="44" width="44" height="12" rx="4" fill="#FF7A1A"/><rect x="58" y="64" width="44" height="12" rx="4" fill="#E8430F"/><circle cx="124" cy="88" r="20" fill="#4ADE80"/><path d="M114 88l7 7 13-14" stroke="#0A0705" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pay: '<svg viewBox="0 0 160 120"><rect x="8" y="36" width="44" height="72" rx="10" fill="#2A1C12" stroke="#FFB547" stroke-width="3"/><rect x="108" y="36" width="44" height="72" rx="10" fill="#2A1C12" stroke="#FF7A1A" stroke-width="3"/><path d="M58 72h40" stroke="#FF7A1A" stroke-width="5" stroke-linecap="round"/><path d="M90 62l12 10-12 10" stroke="#FF7A1A" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="80" cy="34" r="18" fill="#FFB547"/><text x="80" y="40" text-anchor="middle" font-size="16" font-weight="800" fill="#0A0705">FC</text></svg>',
  rent: '<svg viewBox="0 0 160 120"><rect x="26" y="20" width="108" height="88" rx="12" fill="#2A1C12"/><rect x="26" y="20" width="108" height="24" rx="12" fill="#FF7A1A"/><text x="80" y="84" text-anchor="middle" font-size="26" font-weight="800" fill="#FFB547">15 000</text><text x="80" y="100" text-anchor="middle" font-size="11" fill="#E9D6C6">FC / 40 jours</text></svg>',
  safe: '<svg viewBox="0 0 160 120"><path d="M80 8l52 18v34c0 30-22 48-52 56-30-8-52-26-52-56V26z" fill="#2A1C12" stroke="#FF7A1A" stroke-width="3"/><path d="M58 62l15 15 30-32" stroke="#4ADE80" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
var VX_SC = [
  ['shop', 'Vends tes <em>produits digitaux</em> en RDC', 'Formations, fichiers, modèles, applications : ouvre ta boutique sur cuervo.co en quelques minutes.'],
  ['mm', 'Enregistre tes <em>Mobile Money</em>', 'M-Pesa, Airtel Money, Orange Money. L\'administrateur confirme tes numéros avant la mise en ligne.'],
  ['pay', 'Le client te paie <em>directement</em>', 'Il paie sur ton numéro, envoie sa capture. Tu confirmes : il reçoit ses fichiers tout de suite.'],
  ['rent', 'Loyer : <em>15 000 FC</em> pour 40 jours', 'Paie-le tout de suite, ou sur ta première vente : cuervo.co garde le loyer et te reverse le reste.'],
  ['safe', 'cuervo.co ne garde <em>aucune somme</em>', 'À part le loyer, tout l\'argent va directement sur tes numéros Mobile Money.']
];
var VXT = null;
function explainer() {
  return '<div class="vx" id="vx"><div class="bars">' + VX_SC.map(function () { return '<i><b></b></i>'; }).join('') + '</div>' +
    VX_SC.map(function (sc, i) { return '<div class="sc" data-i="' + i + '"><div class="art">' + VX_ART[sc[0]] + '</div><div class="big">' + sc[1].replace('15 000 FC', esc(money((S.settings || {}).loyer || 15000, 'CDF'))) + '</div><div class="sm">' + esc(sc[2]).replace('15 000 FC', money((S.settings || {}).loyer || 15000, 'CDF')) + '</div></div>'; }).join('') +
    '<div class="brandm">cuervo<span>.co</span></div></div><div class="vx-ctl"><button class="btn btn-ghost btn-sm" type="button" data-act="vxReplay" style="width:auto">' + ico('i-play') + '<span>Revoir (15 s)</span></button></div>';
}
function vxPlay() {
  var root = $('vx'); if (!root) return; clearTimeout(VXT);
  var scs = root.querySelectorAll('.sc'), bars = root.querySelectorAll('.bars b'), i = 0;
  bars.forEach(function (b) { b.style.transition = 'none'; b.style.transform = 'scaleX(0)'; });
  function show() {
    if (!document.body.contains(root)) return;
    scs.forEach(function (el, k) { el.classList.toggle('on', k === i); });
    var b = bars[i]; void b.offsetWidth; b.style.transition = 'transform 3000ms linear'; b.style.transform = 'scaleX(1)';
    i++; if (i < scs.length) VXT = setTimeout(show, 3000);
  }
  show();
}
function showExplainer(title) {
  sheet('<div class="g16"><div class="shead" style="margin:0"><h2>' + (title || 'cuervo.co en 15 secondes') + '</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div>' + explainer() +
    '<a class="btn btn-primary" href="?v=aide" data-nav><span>Tout comprendre en détail</span></a></div>');
  vxPlay();
}

/* ---------- Comment ça marche ---------- */
function pageAide() {
  var loyer = money((S.settings || {}).loyer || 15000, 'CDF');
  setBar(null);
  page('<div class="kicker" style="padding-top:8px">Comment ça marche</div><h1>cuervo.co, la place de marché des produits digitaux en RDC</h1>' +
    '<p class="lead" style="margin-top:12px">Formations, fichiers, modèles, applications, designs : chacun ouvre sa boutique, publie ses produits et encaisse par Mobile Money.</p>' +
    '<div class="sec">' + explainer() + '</div>' +
    '<div class="sec"><div class="keyline">cuervo.co ne garde aucune somme. À part le loyer des boutiques, tout l\'argent des ventes va directement sur les numéros Mobile Money du vendeur.</div></div>' +
    '<div class="sec"><h2 style="margin-bottom:12px">Pour acheter</h2><div class="steps">' +
    '<div class="step"><div><b>Choisis ton produit</b><p>Parcours les boutiques ou demande conseil à Cuervo IA.</p></div></div>' +
    '<div class="step"><div><b>Touche « Payer »</b><p>Entre ton nom et ton numéro WhatsApp. Le numéro M-Pesa, Airtel Money ou Orange Money du vendeur s\'affiche.</p></div></div>' +
    '<div class="step"><div><b>Paie et envoie ta capture</b><p>Paie le montant exact, puis envoie la capture de confirmation depuis la page.</p></div></div>' +
    '<div class="step"><div><b>Reçois tes fichiers</b><p>Dès que le vendeur confirme, tes liens de téléchargement s\'affichent sur la page de ta commande (retrouvée dans « Mes achats »).</p></div></div></div></div>' +
    '<div class="sec"><h2 style="margin-bottom:12px">Pour vendre</h2><div class="steps">' +
    '<div class="step"><div><b>Crée ton compte</b><p>Ton prénom, ton nom, ton postnom, le nom de ta boutique et ton numéro de téléphone.</p></div></div>' +
    '<div class="step"><div><b>Enregistre tes Mobile Money</b><p>Dans Ma boutique → Boutique : le nom du compte et tes numéros M-Pesa, Airtel Money ou Orange Money. L\'administrateur les confirme avant la mise en ligne, et après chaque modification.</p></div></div>' +
    '<div class="step"><div><b>Publie tes produits</b><p>Photos, description (Cuervo IA peut t\'aider), prix en FC ou en $, et le lien de téléchargement Google Drive de ton produit.</p></div></div>' +
    '<div class="step"><div><b>Confirme tes ventes</b><p>Quand l\'argent arrive sur ton numéro, touche « Argent reçu » : le client reçoit son produit.</p></div></div></div></div>' +
    '<div class="sec"><h2 style="margin-bottom:12px">Le loyer : ' + loyer + ' pour 40 jours</h2><div class="steps">' +
    '<div class="step"><div><b>Option 1 : payer tout de suite</b><p>Tu paies le loyer sur les numéros de cuervo.co (onglet Loyer) et tu envoies ta capture. Chaque paiement confirmé donne 40 jours.</p></div></div>' +
    '<div class="step"><div><b>Option 2 : payer sur ta première vente</b><p>Ta boutique est en ligne sans rien payer. Ta première vente arrive sur les numéros de cuervo.co : l\'administrateur garde le loyer (jusqu\'à ' + loyer + ') et te reverse le reste. Les ventes suivantes vont directement chez toi.</p></div></div>' +
    '<div class="step"><div><b>Loyer non payé</b><p>L\'administrateur peut suspendre une boutique qui ne paie pas son loyer. Tu reçois un rappel 5 jours avant la fin de la période.</p></div></div></div></div>' +
    '<div class="sec g8"><a class="btn btn-primary" href="?v=compte" data-nav><span>' + (S.vendor ? 'Ma boutique' : 'Ouvrir ma boutique') + '</span></a><a class="btn btn-ghost" href="?v=ia" data-nav><span>Poser une question à Cuervo IA</span></a></div>');
  vxPlay();
}

/* ---------- Produit ---------- */
function ytId(u) { var m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/.exec(u); return m ? m[1] : ''; }
function vidFit(v) {
  var w = v.videoWidth, h = v.videoHeight, b = v.parentNode; if (!w || !h || !b) return;
  b.style.aspectRatio = w + ' / ' + h; b.classList.toggle('v916', h > w);
}
window.vidFit = vidFit;
function videoHtml(v) {
  var u = safeUrl(v && v.url); if (!u) return '';
  var y = ytId(u), t = v.titre ? '<p class="vt">' + esc(v.titre) + '</p>' : '', vc = v.format === '9:16' ? 'vid v916' : 'vid';
  if (y) return '<div><div class="' + vc + '"><iframe src="https://www.youtube-nocookie.com/embed/' + y + '" allowfullscreen loading="lazy" title="Vidéo"></iframe></div>' + t + '</div>';
  if (/\.(mp4|webm|mov|3gp|mkv)(\?|$)/i.test(u)) return '<div><div class="' + vc + '"><video controls playsinline preload="metadata" onloadedmetadata="vidFit(this)" src="' + esc(u) + '"></video></div>' + t + '</div>';
  return '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="' + esc(u) + '">' + ico('i-play') + esc(v.titre || 'Voir la vidéo') + '</a>';
}
var RS = [['facebook', 'Facebook', '#1877F2', 'f'], ['tiktok', 'TikTok', '#111', '♪'], ['instagram', 'Instagram', '#E1306C', '◎'], ['youtube', 'YouTube', '#FF0000', '▶']];
function socialRow(s) {
  var r = s.reseaux || {}, h = '', wa = waNum(s.whatsapp);
  RS.forEach(function (x) { var u = safeUrl(r[x[0]]); if (u) h += '<a class="soc" target="_blank" rel="noopener" href="' + esc(u) + '"><i style="background:' + x[2] + '">' + x[3] + '</i>' + x[1] + '</a>'; });
  if (wa) h += '<a class="soc" target="_blank" rel="noopener" href="https://wa.me/' + wa + '"><i style="background:#25D366">✆</i>WhatsApp</a>';
  return h ? '<div class="socs">' + h + '</div>' : '';
}
function shareRow(url, text, img) {
  var u = encodeURIComponent(url);
  return '<div class="g8"><div class="two"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text + ' ' + url) + '">WhatsApp</a>' +
    '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + u + '">Facebook</a></div>' +
    (navigator.share ? '<button class="btn btn-ghost btn-sm" type="button" data-act="natShare" data-url="' + esc(url) + '" data-text="' + esc(text) + '" data-img="' + esc(img || '') + '">' + ico('i-share') + 'Statut, Instagram, TikTok…</button>' : '') +
    '<button class="btn btn-ghost btn-sm" type="button" data-act="copy" data-text="' + esc(url) + '">Copier le lien</button></div>';
}
function bPrix(p) {
  var pr = p.prix_actuel != null ? p.prix_actuel : ((p.promo_prix > 0 && (!p.promo_fin || new Date(p.promo_fin) > new Date())) ? p.promo_prix : p.prix);
  return pr ? money(pr, p.devise) : '';
}
function contactRow(s) {
  var wa = waNum(s.whatsapp), h = '';
  if (wa) h += '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">' + ico('i-chat') + 'Poser une question</a>';
  if (s.tel) h += '<a class="btn btn-ghost btn-sm" href="tel:' + esc(String(s.tel).replace(/[^\d+]/g, '')) + '">Appeler ' + esc(s.tel) + '</a>';
  return h ? '<div class="g8">' + h + '</div>' : '';
}
async function pageProduct(id, alive) {
  skeleton();
  var r = await sb.rpc('mk_product', { p_id: id }); if (!alive()) return;
  if (r.error || !r.data) return notFound('Ce produit n\'est plus disponible.');
  var d = r.data, p = d.product, s = d.shop; S.ctx = { product: p, shop: s };
  var end = p.promo_fin ? new Date(p.promo_fin).getTime() : null, promo = '';
  if (p.promo) promo = '<div class="promo-box"><span class="badge">' + ico('i-clock', 'width:14px;height:14px') + 'Promo −' + Math.round((1 - p.prix_actuel / p.prix) * 100) + ' %</span>' +
    (end ? '<div class="lbl">L\'offre se termine dans</div><div class="cd" data-end="' + end + '"></div>' : '') +
    (p.promo_places != null ? '<div class="places">Plus que ' + p.promo_places + ' place' + (p.promo_places > 1 ? 's' : '') + ' à ce prix</div>' : '') + '</div>';
  var exs = (p.exemples || []).filter(function (e) { return safeUrl(e && e.url); });
  var vids = (p.videos || []).map(videoHtml).filter(Boolean);
  var canPay = (s.ops || []).length > 0 && !d.apercu;
  var mine = S.vendor && S.vendor.id === p.vendor_id;
  var sold = '<b>' + (p.ventes || 0) + '</b> vente' + (p.ventes > 1 ? 's' : '');
  document.title = p.titre + ' — ' + s.boutique;
  page(
    (d.apercu ? '<div class="banner"><b>Aperçu</b>Ce produit n\'est pas encore visible du public' + (d.bloque ? ' : il a été bloqué par l\'administrateur.' : '. Vérifie le loyer et les numéros Mobile Money de la boutique.') + '</div><div style="height:16px"></div>' : '') +
    '<a class="shoprow top" href="?b=' + esc(s.slug) + '" data-nav>' + avatar(s) + '<div class="grow"><b>' + esc(s.boutique) + '</b><small>Visiter la boutique</small></div>' + ico('i-arrow') + '</a>' +
    socialRow(s) +
    '<div class="cover' + (safeUrl(p.cover_url) ? ' zoom" data-zoom="' + esc(safeUrl(p.cover_url)) : '') + '">' + (safeUrl(p.cover_url) ? pic(p.cover_url) : '<div class="ph"><div><b>' + esc(s.boutique) + '</b></div></div>') + '</div>' +
    '<article class="prod"><div class="phead"><div class="sq' + (safeUrl(p.image_url) ? ' zoom" data-zoom="' + esc(safeUrl(p.image_url)) : '') + '">' + pic(p.image_url) + '</div><div style="min-width:0"><span class="sold">' + sold + '</span><h1>' + esc(p.titre) + '</h1>' +
    '<div class="price-row"><div class="price">' + money(p.prix_actuel, p.devise) + '</div>' + (p.promo ? '<div class="old"><s>' + money(p.prix, p.devise) + '</s></div>' : '') + '</div></div></div>' + promo +
    (mine ? '<div class="ownbar"><button class="btn btn-ghost btn-sm" type="button" data-act="editHere" data-id="' + esc(p.id) + '"><span>Modifier</span></button><button class="btn btn-ghost btn-sm" type="button" data-act="shareProduct" data-id="' + esc(p.id) + '" data-title="' + esc(p.titre) + '" data-img="' + esc(safeUrl(p.image_url)) + '" data-prix="' + esc(bPrix(p)) + '">' + ico('i-share') + '<span>Partager</span></button></div>' : '') +
    (p.description ? '<div class="sub">Description</div><p class="desc">' + esc(p.description) + '</p>' : '') +
    ((p.points || []).length ? '<div class="sub">Les points forts</div><ul class="ck">' + p.points.map(function (t) { return '<li>' + ico('i-check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' : '') +
    (vids.length ? '<div class="sub">Vidéos explicatives</div><div class="g16">' + vids.join('') + '</div>' : '') +
    (exs.length ? '<div class="sub">Exemples</div><div class="exs">' + exs.map(function (e) { return '<figure class="ex"><div class="sq zoom" data-zoom="' + esc(safeUrl(e.url)) + '">' + pic(e.url) + '</div>' + (e.legende ? '<figcaption>' + esc(e.legende) + '</figcaption>' : '') + '</figure>'; }).join('') + '</div>' : '') +
    ((p.temoignages || []).length ? '<div class="sub">Ce qu\'en disent les clients</div><div class="g8">' + p.temoignages.map(function (t) { return '<div class="avis"><span class="q gt">“</span><p>' + esc(t.texte) + '</p>' + (t.nom ? '<b>' + esc(t.nom) + '</b>' : '') + '</div>'; }).join('') + '</div>' : '') +
    (canPay ? '<button class="btn btn-primary" style="margin-top:24px" type="button" data-act="pay">Payer ' + money(p.prix_actuel, p.devise) + ' ' + ico('i-arrow') + '</button>' : '<div class="banner">Le paiement n\'est pas encore disponible pour ce produit.</div>') +
    '</article>' +
    '<div class="sec g12"><h2>Une question ?</h2>' + (contactRow(s) || '<p class="lead">Le vendeur n\'a pas encore indiqué de contact.</p>') + '</div>' +
    '<div class="sec g12"><h2>Partager ce produit</h2>' + shareRow(plink(p.id), p.titre, safeUrl(p.image_url)) + '</div>' +
    (mine ? '' : '<div class="sec"><button class="btn btn-ghost btn-sm rep-btn" type="button" data-act="report" data-id="' + esc(p.id) + '">' + ico('i-flag') + '<span>Signaler ce produit</span></button></div>') +
    (d.autres.length ? '<div class="sec"><h2 style="margin-bottom:16px">Dans la même boutique</h2><div class="grid stag">' + d.autres.map(card).join('') + '</div></div>' : '') +
    (S.vendor && S.vendor.is_admin ? '<div class="sec"><button class="btn btn-danger btn-sm" type="button" data-act="blockProduct" data-id="' + esc(p.id) + '" data-on="' + (d.bloque ? '0' : '1') + '">' + (d.bloque ? 'Débloquer ce produit' : 'Bloquer ce produit (admin)') + '</button></div>' : ''));
  setBar(canPay ? '<div class="from">' + (p.promo ? 'Prix promo' : 'Prix') + '<b>' + money(p.prix_actuel, p.devise) + '</b></div><button class="btn btn-primary" type="button" data-act="pay">Payer</button>' : null);
}

/* ---------- Boutique ---------- */
async function pageShop(slug, alive) {
  skeleton();
  var r = await sb.rpc('mk_shop', { p_slug: slug }); if (!alive()) return;
  if (r.error || !r.data) return notFound('Cette boutique n\'est pas en ligne.');
  var d = r.data, s = d.shop, ps = d.products || [];
  document.title = s.boutique + ' — cuervo.co';
  page((d.apercu ? '<div class="banner"><b>Aperçu</b>Cette boutique n\'est pas encore visible du public.</div><div style="height:16px"></div>' : '') +
    (safeUrl(s.cover_url) ? '<div class="cover zoom" data-zoom="' + esc(safeUrl(s.cover_url)) + '">' + pic(s.cover_url) + '</div>' : '<div class="shopbanner"></div>') +
    '<div style="padding:0 8px"><span' + (safeUrl(s.avatar_url) ? ' class="zoom" data-zoom="' + esc(safeUrl(s.avatar_url)) + '"' : '') + ' style="display:inline-block">' + avatar(s, 'lg') + '</span><h1 style="margin-top:12px">' + esc(s.boutique) + '</h1><p class="note" style="margin-top:4px">Par ' + esc(s.vendeur) + '</p>' + (s.bio ? '<p class="lead" style="margin-top:12px;white-space:pre-line">' + esc(s.bio) + '</p>' : '') + '</div>' +
    socialRow(s) +
    '<div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><b class="gt" data-count="' + (s.ventes || 0) + '">0</b><span>produits vendus</span></div><div class="stat"><b>' + ps.length + '</b><span>produit' + (ps.length > 1 ? 's' : '') + ' en ligne</span></div></div>' +
    '<div class="sec"><h2 style="margin-bottom:16px">Produits</h2>' + (ps.length ? '<div class="grid stag">' + ps.map(card).join('') + '</div>' : '<div class="empty">Cette boutique n\'a pas encore de produit.</div>') + '</div>' +
    '<div class="sec g12"><h2>Contacter le vendeur</h2>' + (contactRow(s) || '<p class="lead">Aucun contact indiqué.</p>') + '</div>' +
    '<div class="sec g12"><h2>Partager cette boutique</h2>' + shareRow(link('?b=' + s.slug), s.boutique) + '</div>');
  setBar(null);
}

/* ---------- Paiement ---------- */
function payInfo(o) {
  return '<div class="recap"><span>' + esc(o.titre) + '</span><b class="gt">' + money(o.montant, o.devise) + '</b></div>' +
    '<div class="paynum"><small>Envoie ' + money(o.montant, o.devise) + ' par ' + (OPS[o.op] || '') + ' au</small><div class="n">' + esc(o.numero || '') + '</div>' + (o.mm_nom ? '<small>Nom du compte : ' + esc(o.mm_nom) + '</small>' : '') + '</div>' +
    '<label>Capture de ton paiement<input type="file" accept="image/*" id="capFile"></label>' +
    '<div class="msg-err hide" id="capErr"></div>' +
    '<button class="btn btn-primary" type="button" data-act="sendCapture" data-id="' + esc(o.id) + '" data-token="' + esc(o.token) + '"><span>Envoyer ma capture</span></button>' +
    '<p class="note center">Dès que le vendeur confirme ton paiement, tes fichiers s\'affichent ici même.</p>';
}
var A = {
  closeSheet: function () { closeSheet(); dropDraft(); },
  dl: function (el) { if (XHR) return toast('Un transfert est déjà en cours'); download(el.dataset.url, el.dataset.name); },
  cancelXfer: function () { if (XHR) XHR.abort(); },
  iaSugg: function (el) { iaAsk(el.textContent); },
  vxReplay: function () { vxPlay(); },
  explainer: function () { showExplainer(); },
  theme: function () { theme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); },
  navProducts: async function () { if (new URLSearchParams(location.search).toString()) { history.pushState({}, '', location.pathname); await route(); } var el = $('produits'); if (el) el.scrollIntoView(); var i = $('h-q'); if (i) i.focus(); },
  cat: function (el) { var h = S.ctx.home; if (!h) return; h.cat = el.dataset.id; $('homeCats').innerHTML = homeCats(); $('homeGrid').innerHTML = homeGrid(); },
  toProducts: function () { var el = $('produits'); if (el) el.scrollIntoView(); },
  copy: function (el) { try { navigator.clipboard.writeText(el.dataset.text).then(function () { toast(el.dataset.msg || 'Lien copié'); }, function () { toast('Copie impossible sur cet appareil'); }); } catch (e) { toast('Copie impossible sur cet appareil'); } },
  pay: function () {
    var p = S.ctx.product, s = S.ctx.shop; if (!p) return;
    sheet('<div class="g16"><div class="shead" style="margin:0"><h2>Paiement</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div>' +
      '<div class="recap"><span>' + esc(p.titre) + '</span><b class="gt">' + money(p.prix_actuel, p.devise) + '</b></div>' +
      '<label>Nom complet<input id="c-nom" autocomplete="name" placeholder="Ex. Grâce Mbuyi"></label>' +
      '<label>Numéro WhatsApp<input id="c-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex. 0812 345 678"></label>' +
      '<label>Tu paies avec<select id="c-op">' + (s.ops || []).map(function (k) { return '<option value="' + k + '">' + OPS[k] + '</option>'; }).join('') + '</select></label>' +
      '<div class="msg-err hide" id="c-err"></div>' +
      '<button class="btn btn-primary" type="button" data-act="payNext"><span>Voir les informations de paiement</span></button></div>');
  },
  payNext: async function (el) {
    var nom = $('c-nom').value.trim(), tel = $('c-tel').value.trim(), err = $('c-err');
    if (nom.length < 2 || tel.replace(/\D/g, '').length < 9) { err.textContent = 'Entre ton nom et un numéro WhatsApp valide.'; err.classList.remove('hide'); return; }
    busy(el, true);
    var r = await sb.rpc('mk_order_create', { p_product: S.ctx.product.id, p_nom: nom, p_tel: tel, p_op: $('c-op').value });
    busy(el, false);
    if (r.error) { err.textContent = errMsg(r.error); err.classList.remove('hide'); return; }
    addToken(r.data.token);
    sheet('<div class="g16"><div class="shead" style="margin:0"><h2>Informations de paiement</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div>' + payInfo(r.data) + '</div>');
  },
  sendCapture: async function (el) {
    var f = $('capFile').files[0], err = $('capErr');
    if (!f) { err.textContent = 'Choisis d\'abord la capture de ton paiement.'; err.classList.remove('hide'); return; }
    busy(el, true);
    try {
      var blob = await toJpeg(f, 1400, 1400, false), path = 'o/' + el.dataset.id + '/' + rnd() + '.jpg';
      await upload('mk-captures', path, blob, 'image/jpeg', 'Envoi de la capture');
      var r = await sb.rpc('mk_order_capture', { p_token: el.dataset.token, p_path: path }); if (r.error) throw r.error;
      closeSheet(); toast('Capture envoyée'); nav('?c=' + el.dataset.token);
    } catch (e) { busy(el, false); err.textContent = errMsg(e); err.classList.remove('hide'); }
  },

  /* ---------- Compte ---------- */
  authMode: function (el) { S.ctx.auth = el.dataset.id; renderAuth(); },
  login: async function (el) {
    var tel = waNum($('a-tel').value), pw = $('a-pw').value, err = $('a-err');
    if (tel.length < 11 || pw.length < 6) { err.textContent = 'Entre ton numéro et ton mot de passe (6 caractères minimum).'; err.classList.remove('hide'); return; }
    busy(el, true);
    var r = await sb.auth.signInWithPassword({ email: tel + '@telephone.cuervo.app', password: pw });
    if (r.error) { busy(el, false); err.textContent = errMsg(r.error); err.classList.remove('hide'); return; }
    await loadMe(); header(); route();
  },
  register: async function (el) {
    var g = function (k) { return ($(k) ? $(k).value : '').trim(); }, err = $('a-err');
    var tel = waNum(g('a-tel')), pw = $('a-pw') ? $('a-pw').value : '';
    if (!g('a-prenom') || !g('a-nom') || g('a-boutique').length < 2) { err.textContent = 'Remplis ton prénom, ton nom et le nom de ta boutique.'; err.classList.remove('hide'); return; }
    busy(el, true);
    try {
      if (!S.user) {
        if (tel.length < 11 || pw.length < 6) throw new Error('Entre un numéro valide et un mot de passe de 6 caractères minimum.');
        var r = await sb.auth.signUp({ email: tel + '@telephone.cuervo.app', password: pw }); if (r.error) throw r.error;
        if (!r.data.session) { var l = await sb.auth.signInWithPassword({ email: tel + '@telephone.cuervo.app', password: pw }); if (l.error) throw l.error; }
        S.user = (await sb.auth.getUser()).data.user;
      }
      var v = await sb.rpc('mk_register', { p_nom: g('a-nom'), p_postnom: g('a-postnom'), p_prenom: g('a-prenom'), p_boutique: g('a-boutique'), p_tel: g('a-tel') || '' });
      if (v.error) throw v.error;
      var md = document.querySelector('input[name=a-mode]:checked');
      if (md && md.value !== 'premiere_vente') await sb.from('mk_vendors').update({ loyer_mode: md.value }).eq('id', S.user.id);
      await loadMe(); header(); S.tab = 'boutique'; toast('Boutique créée'); await route(); showExplainer('Bienvenue sur cuervo.co');
    } catch (e) { busy(el, false); err.textContent = errMsg(e); err.classList.remove('hide'); }
  },
  forgot: function () {
    var wa = waNum((S.settings || {}).whatsapp);
    sheet('<div class="g16"><div class="shead" style="margin:0"><h2>Mot de passe oublié</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div>' +
      '<p class="lead">L\'administrateur de cuervo.co peut te donner un nouveau mot de passe. Écris-lui avec le numéro de ton compte.</p>' +
      (wa ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent('Bonjour, j\'ai oublié le mot de passe de ma boutique cuervo.co. Mon numéro de compte : ' + ($('a-tel') ? $('a-tel').value : '')) + '">' + ico('i-chat') + '<span>Écrire à l\'administrateur</span></a>' : '<div class="banner">Contacte l\'administrateur de cuervo.co.</div>') + '</div>');
  },
  changePw: async function (el) {
    var pw = $('s-pw').value;
    if (pw.length < 6) return toast('Le mot de passe doit avoir au moins 6 caractères');
    busy(el, true); var r = await sb.auth.updateUser({ password: pw }); busy(el, false);
    if (r.error) return toast(errMsg(r.error));
    $('s-pw').value = ''; toast('Mot de passe changé');
  },
  admReset: async function (el) {
    if (armed !== 'pw' + el.dataset.id) { armed = 'pw' + el.dataset.id; el.textContent = 'Confirmer : nouveau mot de passe'; return; }
    var abc = 'abcdefghjkmnpqrstuvwxyz23456789', a = new Uint32Array(8), pw = ''; crypto.getRandomValues(a);
    for (var i = 0; i < 8; i++) pw += abc.charAt(a[i] % abc.length);
    busy(el, true); var r = await sb.rpc('mk_admin_reset_password', { p_id: el.dataset.id, p_pw: pw }); busy(el, false); armed = '';
    if (r.error) return toast(errMsg(r.error));
    var wa = waNum(el.dataset.tel);
    sheet('<div class="g16"><div class="shead" style="margin:0"><h2>Nouveau mot de passe</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div>' +
      '<p class="lead">Mot de passe de « ' + esc(el.dataset.name) + ' ». Note-le : il ne sera plus affiché.</p><div class="paynum"><div class="n">' + pw + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="copy" data-text="' + pw + '">Copier</button>' +
      (wa ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent('Bonjour, voici ton nouveau mot de passe cuervo.co : ' + pw + '\nConnecte-toi avec ton numéro, puis change-le dans Ma boutique → Boutique.') + '"><span>Envoyer au vendeur sur WhatsApp</span></a>' : '') + '</div>');
  },
  logout: async function () { await sb.auth.signOut(); S.user = null; S.vendor = null; header(); nav('./'); },
  tab: function (el) { S.tab = el.dataset.id; armed = ''; renderDash(); },
  atab: function (el) { S.atab = el.dataset.id; renderAdmin(); },

  /* Commandes du vendeur */
  orderOk: async function (el) { await decide(el, true); },
  orderNo: async function (el) { if (armed !== 'no' + el.dataset.id) { armed = 'no' + el.dataset.id; el.textContent = 'Confirmer le refus'; return; } await decide(el, false); },
  viewCapture: async function (el) {
    var r = await sb.storage.from('mk-captures').createSignedUrl(el.dataset.path, 600);
    if (r.error) return toast('Capture introuvable');
    sheet('<div class="shead"><h2>Capture du paiement</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div><img class="viewer" src="' + esc(r.data.signedUrl) + '" alt="Capture du paiement">');
  },

  /* Produits du vendeur */
  newProduct: function () { openEditor(null); },
  natShare: async function (el) {
    var d = el.dataset, data = { title: d.text, text: d.text + ' ' + d.url };
    try {
      if (d.img && navigator.canShare) {
        var b = await (await fetch(d.img)).blob(), fl = new File([b], 'produit.' + ((b.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')), { type: b.type || 'image/jpeg' });
        if (navigator.canShare({ files: [fl] })) data.files = [fl];
      }
    } catch (e) { }
    try { await navigator.share(data); } catch (e) { if (data.files) { try { delete data.files; await navigator.share(data); } catch (e2) { } } }
  },
  shareProduct: function (el) {
    var url = plink(el.dataset.id);
    sheet('<div class="g16"><div class="shead" style="margin:0"><h2>Partager le produit</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div>' +
      '<p class="lead">Ce lien ouvre directement « ' + esc(el.dataset.title) + ' ». Depuis le produit, le client peut aussi visiter ta boutique.</p>' +
      '<div class="linkbox">' + esc(url) + '</div>' + shareRow(url, el.dataset.title, el.dataset.img) + '</div>');
  },
  editHere: async function (el) {
    var r = await sb.from('mk_products').select('*').eq('id', el.dataset.id).maybeSingle();
    if (r.error || !r.data) return toast('Produit introuvable');
    await openEditor(r.data);
  },
  editProduct: function (el) { openEditor(S.products.filter(function (p) { return p.id === el.dataset.id; })[0]); },
  edSave: async function (el) { busy(el, true); try { await edSave(); dropDraft(); toast('Produit enregistré'); edRender(); if (new URLSearchParams(location.search).get('p')) { closeSheet(); route(); return; } await loadDash(); if (S.tab === 'produits') renderDash(true); } catch (e) { toast(errMsg(e)); } busy(el, false); },
  edDelete: async function (el) {
    if (armed !== 'del') { armed = 'del'; el.textContent = 'Confirmer la suppression'; return; }
    var r = await sb.from('mk_products').delete().eq('id', E.id); if (r.error) return toast(errMsg(r.error));
    closeSheet(); toast('Produit supprimé'); await loadDash(); renderDash();
  },
  edAddTem: function () { var t = $('e-ttexte').value.trim(), n = $('e-tnom').value.trim(); if (t.length < 3) return toast('Écris le témoignage du client'); edRead(); E.p.temoignages.push({ nom: n, texte: t }); edRender(); toast('Témoignage ajouté : pense à enregistrer'); },
  edRmTem: function (el) { edRead(); E.p.temoignages.splice(Number(el.dataset.i), 1); edRender(); },
  edRmEx: function (el) { edRead(); E.p.exemples.splice(Number(el.dataset.i), 1); edRender(); },
  edVidFmt: function (el) { edRead(); var v = E.p.videos[Number(el.dataset.i)]; if (v) { v.format = v.format === '9:16' ? '16:9' : '9:16'; edRender(); } },
  edRmVid: function (el) { edRead(); E.p.videos.splice(Number(el.dataset.i), 1); edRender(); },
  edAddVidLink: function () {
    edRead(); var u = safeUrl($('e-vurl').value);
    if (!u) return toast('Colle un lien complet qui commence par https://');
    if (E.p.videos.length >= 3) return toast('3 vidéos maximum');
    E.p.videos.push({ url: u, titre: $('e-vtitre').value.trim(), format: /youtube\.com\/shorts\//.test(u) ? '9:16' : $('e-vfmt').value }); edRender();
  },
  edAddLink: async function (el) {
    var u = safeUrl($('e-furl').value), n = $('e-fnom').value.trim();
    if (!u) return toast('Colle un lien complet qui commence par https://');
    busy(el, true);
    try { if (!E.id) await edSave(); var r = await sb.from('mk_product_files').insert({ product_id: E.id, vendor_id: S.user.id, nom: n || 'Lien de téléchargement', url: u, kind: 'lien' }); if (r.error) throw r.error; edRead(); await edLoadFiles(); edRender(); toast('Lien ajouté'); }
    catch (e) { toast(errMsg(e)); }
    busy(el, false);
  },
  edRmFile: async function (el) { var r = await sb.from('mk_product_files').delete().eq('id', el.dataset.id); if (r.error) return toast(errMsg(r.error)); edRead(); await edLoadFiles(); edRender(); },
  edAI: async function (el) {
    edRead(); if (!E.p.titre && !E.p.description && !E.p.points.length) return toast('Écris d\'abord un titre ou quelques mots sur ton produit');
    busy(el, true); E.ai = 'loading'; edRender();
    var r = await sb.functions.invoke('mk-ai', { body: { titre: E.p.titre, description: E.p.description, points: E.p.points } });
    if (!E) return;
    if (r.error || !r.data || r.data.error || !r.data.propositions) {
      var m = r.data && r.data.error; try { if (!m && r.error && r.error.context) m = (await r.error.context.json()).error; } catch (e) {}
      E.ai = null; edRender(); return toast(m || 'L\'assistant IA n\'est pas disponible pour le moment.');
    }
    E.ai = r.data.propositions; edRender();
  },
  edUseAI: function (el) {
    edRead(); var pr = E.ai && E.ai[Number(el.dataset.i)]; if (!pr) return;
    E.p.description = pr.description; if (pr.points.length) E.p.points = pr.points.slice();
    E.ai = null; edRender(); toast('Proposition appliquée : modifie-la si besoin, puis enregistre');
  },
  edCloseAI: function () { edRead(); E.ai = null; edRender(); },

  /* Boutique et loyer */
  saveShop: async function (el) {
    var g = function (k) { return $(k).value.trim(); };
    if (g('s-boutique').length < 2 || !g('s-prenom') || !g('s-nom')) return toast('Le nom de la boutique, ton prénom et ton nom sont obligatoires');
    var rs = {}, bad = '';
    RS.forEach(function (x) { var u = g('s-rs-' + x[0]); if (!u) return; if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, ''); u = u.replace(/^http:/i, 'https:'); if (!safeUrl(u)) bad = x[1]; else rs[x[0]] = u; });
    if (bad) return toast('Le lien ' + bad + ' n\'est pas valide');
    busy(el, true);
    var r = await sb.from('mk_vendors').update({ reseaux: rs, boutique: g('s-boutique'), bio: g('s-bio'), tel: g('s-tel'), whatsapp: g('s-wa'), prenom: g('s-prenom'), nom: g('s-nom'), postnom: g('s-postnom'),
      mm_nom: g('s-mmnom'), mpesa: g('s-mpesa'), airtel: g('s-airtel'), orange: g('s-orange') }).eq('id', S.user.id);
    busy(el, false);
    if (r.error) return toast(errMsg(r.error));
    await loadMe(); renderDash(true); toast('Boutique enregistrée');
  },
  saveMode: async function (el) {
    var md = document.querySelector('input[name=l-mode]:checked'); if (!md) return;
    busy(el, true); var r = await sb.from('mk_vendors').update({ loyer_mode: md.value }).eq('id', S.user.id); busy(el, false);
    if (r.error) return toast(errMsg(r.error));
    await loadMe(); renderDash(true); toast('Choix enregistré');
  },
  paySub: async function (el) {
    var f = $('l-cap').files[0], ref = $('l-ref').value.trim();
    if (!f && !ref) return toast('Ajoute la capture ou la référence de ton paiement');
    busy(el, true);
    try {
      var path = null;
      if (f) { var b = await toJpeg(f, 1400, 1400, false); path = 's/' + S.user.id + '/' + rnd() + '.jpg'; await upload('mk-captures', path, b, 'image/jpeg', 'Envoi de la capture'); }
      var r = await sb.rpc('mk_sub_create', { p_op: $('l-op').value, p_ref: ref, p_path: path }); if (r.error) throw r.error;
      await loadDash(); renderDash(); toast('Paiement envoyé à l\'administrateur');
    } catch (e) { busy(el, false); toast(errMsg(e)); }
  },

  /* Administration */
  admVendor: async function (el) {
    var act = el.dataset.do;
    if (act === 'suspendre' && armed !== 'sus' + el.dataset.id) { armed = 'sus' + el.dataset.id; el.textContent = 'Confirmer le blocage'; return; }
    busy(el, true); var r = await sb.rpc('mk_admin_vendor', { p_id: el.dataset.id, p_action: act });
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    toast('C\'est fait'); await loadAdmin(); renderAdmin();
  },
  vf: function (el) { S.vf = el.dataset.id; renderAdmin(); },
  report: function (el) {
    S.rep = { id: el.dataset.id, motif: '' };
    sheet('<div class="g16"><div class="shead" style="margin:0"><h2>Signaler ce produit</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div>' +
      '<p class="note">Choisis ce qui s\'est passé. L\'administrateur de cuervo.co reçoit ton signalement et peut bloquer la boutique.</p>' +
      '<div class="rep-list stag">' + REPORTS.map(function (m, i) { return '<button class="rep-opt" type="button" data-act="repPick" data-i="' + i + '"><span class="rep-dot"></span><span class="grow"><b>' + esc(m[0]) + '</b><small>' + esc(m[1]) + '</small></span></button>'; }).join('') + '</div>' +
      '<label>Explique en quelques mots (facultatif)<textarea id="rep-d" rows="3" maxlength="600" placeholder="Ex. : j\'ai payé le 10 novembre, le vendeur ne répond plus."></textarea></label>' +
      '<label>Ton numéro WhatsApp (facultatif)<input id="rep-c" type="tel" maxlength="40" placeholder="Pour que l\'administrateur te recontacte"></label>' +
      '<button class="btn btn-danger" id="rep-go" type="button" data-act="repSend" disabled><span>Envoyer le signalement</span></button></div>');
  },
  repPick: function (el) {
    S.rep.motif = REPORTS[Number(el.dataset.i)][0];
    document.querySelectorAll('.rep-opt').forEach(function (b) { b.classList.toggle('on', b === el); });
    $('rep-go').disabled = false;
  },
  repSend: async function (el) {
    if (!S.rep || !S.rep.motif) return toast('Choisis un motif');
    try { var k = 'cv_rep_' + S.rep.id; if (localStorage.getItem(k)) { closeSheet(); return toast('Tu as déjà signalé ce produit. Merci !'); } } catch (e) {}
    busy(el, true);
    var r = await sb.rpc('mk_report', { p_product: S.rep.id, p_motif: S.rep.motif, p_details: ($('rep-d') || {}).value || '', p_contact: ($('rep-c') || {}).value || '' });
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    try { localStorage.setItem('cv_rep_' + S.rep.id, '1'); } catch (e) {}
    sheet('<div class="g16 center" style="padding:16px 0"><div class="check">' + ico('i-check') + '</div><h2>Signalement envoyé</h2><p class="lead">Merci. L\'administrateur va vérifier cette boutique.</p><button class="btn btn-ghost" type="button" data-act="closeSheet">Fermer</button></div>');
  },
  admRepDone: async function (el) {
    busy(el, true); var r = await sb.rpc('mk_admin_report_done', { p_id: el.dataset.id });
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    toast('Signalement classé'); await loadAdmin(); renderAdmin();
  },
  admLV: async function (el) {
    var ok = el.dataset.ok === '1', inp = $('ret-' + el.dataset.id), ret = ok ? Number(inp && inp.value) : 0;
    if (!ok && armed !== 'lv' + el.dataset.id) { armed = 'lv' + el.dataset.id; el.textContent = 'Confirmer le refus'; return; }
    if (ok && !(ret >= 0)) return toast('Indique le montant gardé pour le loyer');
    busy(el, true); var r = await sb.rpc('mk_admin_loyer_vente', { p_id: el.dataset.id, p_ok: ok, p_retenu: ret }); armed = '';
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    toast(ok ? (r.data.loyer_couvert ? 'Vente confirmée : loyer payé pour 40 jours' : 'Vente confirmée : loyer partiellement payé') : 'Vente refusée'); await loadAdmin(); renderAdmin();
  },
  admRev: async function (el) {
    busy(el, true); var r = await sb.rpc('mk_admin_reverse', { p_id: el.dataset.id });
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    toast('Reversement noté'); await loadAdmin(); renderAdmin();
  },
  admSub: async function (el) {
    busy(el, true); var r = await sb.rpc('mk_admin_sub', { p_id: el.dataset.id, p_ok: el.dataset.ok === '1' });
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    toast(el.dataset.ok === '1' ? 'Loyer confirmé : 40 jours ajoutés' : 'Paiement refusé'); await loadAdmin(); renderAdmin();
  },
  admSettings: async function (el) {
    var g = function (k) { return $(k).value.trim(); }, loyer = Number(g('g-loyer'));
    if (!(loyer >= 0)) return toast('Loyer invalide');
    busy(el, true);
    if (loyer > 1000000) return toast('Loyer trop élevé');
    var r = await sb.rpc('mk_admin_settings', { p_loyer: loyer, p_mm_nom: g('g-nom'), p_mpesa: g('g-mpesa'), p_airtel: g('g-airtel'), p_orange: g('g-orange'), p_whatsapp: g('g-wa') });
    busy(el, false);
    if (r.error) return toast(errMsg(r.error));
    await loadSettings(); toast('Réglages enregistrés');
  },
  blockProduct: async function (el) {
    var r = await sb.rpc('mk_admin_product', { p_id: el.dataset.id, p_bloque: el.dataset.on === '1' });
    if (r.error) return toast(errMsg(r.error));
    toast(el.dataset.on === '1' ? 'Produit bloqué' : 'Produit débloqué'); route();
  }
};
async function decide(el, ok) {
  busy(el, true);
  var r = await sb.rpc('mk_order_decide', { p_id: el.dataset.id, p_ok: ok });
  if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
  armed = ''; toast(ok ? 'Vente réussie : le client a maintenant accès à ses fichiers' : 'Commande refusée');
  await loadDash(); renderDash(true);
}

/* ---------- Suivi d'une commande (client) ---------- */
async function pageOrder(token, alive) {
  skeleton();
  async function load(first) {
    var r = await sb.rpc('mk_order_get', { p_token: token }); if (!alive()) return;
    if (r.error || !r.data) { if (first) notFound('Cette commande est introuvable.'); return; }
    var o = r.data, s = o.shop, key = o.statut + (o.capture ? '1' : '0'); o.token = token;
    if (!first && S.ctx.orderKey === key) return;
    S.ctx.orderKey = key; addToken(token);
    var body;
    if (o.statut === 'paye') {
      var fs = o.files || [];
      body = '<div class="check">' + ico('i-check') + '</div><div class="center"><h1 style="font-size:24px">Paiement confirmé</h1><p class="lead" style="margin-top:8px">Merci ' + esc((o.nom || '').split(' ')[0]) + '. Voici ton achat.</p></div>' +
        '<div class="recap"><span>' + esc(o.titre) + '</span><b class="gt">' + money(o.montant, o.devise) + '</b></div>' +
        (fs.length ? '<div class="g8 stag">' + fs.map(function (f) { var u = safeUrl(f.url); if (!u) return ''; return f.kind === 'fichier' ? '<button class="btn btn-primary" type="button" data-act="dl" data-url="' + esc(u) + '" data-name="' + esc(f.nom) + '">' + ico('i-file') + '<span>' + esc(f.nom) + '</span></button>' : '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + esc(u) + '">' + ico('i-file') + '<span>' + esc(f.nom) + '</span></a>'; }).join('') + '</div>'
          : '<div class="banner">Le vendeur n\'a pas encore ajouté de fichier à ce produit. Contacte-le pour recevoir ta commande.</div>') +
        '<p class="note center">Garde le lien de cette page : il te redonne accès à tes fichiers.</p>';
    } else if (o.statut === 'refuse') {
      body = '<div class="banner bad"><b>Paiement non confirmé</b>Le vendeur n\'a pas pu confirmer ton paiement. Contacte-le pour régler le problème.</div><div class="recap"><span>' + esc(o.titre) + '</span><b>' + money(o.montant, o.devise) + '</b></div>';
    } else if (!o.capture) {
      body = '<div><h1 style="font-size:24px">Termine ton paiement</h1><p class="lead" style="margin-top:8px">Paie, puis envoie ta capture.</p></div>' + payInfo(o);
    } else {
      body = '<div class="wait"></div><div class="center"><h1 style="font-size:24px">Capture bien reçue</h1><p class="lead" style="margin-top:8px">Le vendeur vérifie ton paiement. Cette page se met à jour toute seule : tes fichiers apparaîtront ici.</p></div>' +
        '<div class="recap"><span>' + esc(o.titre) + '</span><b class="gt">' + money(o.montant, o.devise) + '</b></div>' +
        (waNum(o.pour_loyer ? o.admin_whatsapp : (s.whatsapp || s.tel)) ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/' + waNum(o.pour_loyer ? o.admin_whatsapp : (s.whatsapp || s.tel)) + '?text=' + encodeURIComponent('Bonjour, je viens de payer « ' + o.titre + ' » (' + money(o.montant, o.devise) + ' par ' + (OPS[o.op] || 'Mobile Money') + ') sur cuervo.co et j\'ai envoyé ma capture. Mon nom : ' + (o.nom || '') + '. Merci de confirmer mon paiement.') + '">' + ico('i-chat') + '<span>Prévenir le vendeur sur WhatsApp</span></a><p class="note center">Le vendeur confirme plus vite quand tu le préviens.</p>' : '');
    }
    page('<div class="prod g16" style="margin-top:8px">' + body + '</div>' +
      '<a class="shoprow" href="?b=' + esc(s.slug) + '" data-nav>' + avatar(s) + '<div class="grow"><b>' + esc(s.boutique) + '</b><small>Voir la boutique</small></div>' + ico('i-arrow') + '</a>' +
      '<div class="sec g12"><h2>Un souci ?</h2>' + (contactRow(s) || '<p class="lead">Le vendeur n\'a pas indiqué de contact.</p>') + '</div>');
    setBar(null);
  }
  await load(true);
  pollT = setInterval(function () { if (!document.hidden) load(false); }, 20000);
}
async function pagePurchases(alive) {
  skeleton();
  var ts = tokens(), rows = await Promise.all(ts.map(function (t) { return sb.rpc('mk_order_get', { p_token: t }).then(function (r) { return r.data ? { t: t, o: r.data } : null; }); }));
  if (!alive()) return;
  rows = rows.filter(Boolean);
  var st = { attente: ['a', 'En attente'], paye: ['g', 'Payé'], refuse: ['r', 'Refusé'] };
  page('<h1 style="padding-top:8px">Mes achats</h1><p class="lead" style="margin:8px 0 24px">Les achats faits depuis ce téléphone.</p>' +
    (rows.length ? '<div class="g12 stag">' + rows.map(function (x) { var s = st[x.o.statut] || st.attente; return '<a class="ord" href="?c=' + esc(x.t) + '" data-nav><div class="top"><div><b>' + esc(x.o.titre) + '</b><small>' + esc(x.o.shop.boutique) + ' · ' + money(x.o.montant, x.o.devise) + '</small></div><span class="tag ' + s[0] + '">' + s[1] + '</span></div></a>'; }).join('') + '</div>'
      : '<div class="empty">Aucun achat pour l\'instant.</div>'));
}

/* ---------- Compte vendeur ---------- */
async function loadMe() {
  var u = (await sb.auth.getSession()).data.session; S.user = u ? u.user : null; S.vendor = null;
  if (S.user) { var r = await sb.from('mk_vendors').select('*').eq('id', S.user.id).maybeSingle(); S.vendor = r.data || null; }
}
async function loadSettings() { var r = await sb.from('mk_settings').select('*').eq('id', 1).maybeSingle(); S.settings = r.data || { loyer: 15000 }; }
async function loadDash() {
  var uid = S.user.id, rs = await Promise.all([
    sb.from('mk_orders').select('*').eq('vendor_id', uid).order('created_at', { ascending: false }).limit(200),
    sb.from('mk_products').select('*').eq('vendor_id', uid).order('created_at', { ascending: false }),
    sb.from('mk_subs').select('*').eq('vendor_id', uid).order('created_at', { ascending: false }).limit(12),
    loadSettings(), loadMe()]);
  S.orders = rs[0].data || []; S.products = rs[1].data || []; S.subs = rs[2].data || [];
}
function loyerChoice(cur, name) {
  var loyer = money((S.settings || {}).loyer || 15000, 'CDF');
  return '<div class="choice"><div style="font-size:14px;font-weight:600">Comment veux-tu payer ton loyer de ' + loyer + ' pour 40 jours ?</div>' +
    '<label class="opt"><input type="radio" name="' + name + '" value="premiere_vente"' + (cur !== 'immediat' ? ' checked' : '') + '><span><b>Sur ma première vente</b><small>Rien à payer maintenant. Ta première vente arrive chez cuervo.co, qui garde le loyer et te reverse le reste.</small></span></label>' +
    '<label class="opt"><input type="radio" name="' + name + '" value="immediat"' + (cur === 'immediat' ? ' checked' : '') + '><span><b>Tout de suite</b><small>Tu paies ' + loyer + ' maintenant (onglet Loyer) : toutes tes ventes vont directement chez toi.</small></span></label>' +
    '<a class="linkbtn" href="?v=aide" data-nav style="text-align:center">Comment ça marche ?</a></div>';
}
function renderAuth() {
  var reg = S.ctx.auth !== 'login', need = !S.user;
  page('<div style="padding-top:8px"><div class="kicker">Espace vendeur</div><h1>' + (reg ? 'Crée ta boutique' : 'Connexion') + '</h1><p class="lead" style="margin-top:8px">' + (reg ? 'Loyer : ' + money((S.settings || {}).loyer || 15000, 'CDF') + ' pour 40 jours, tout de suite ou sur ta première vente.' : 'Entre dans ton espace vendeur.') + '</p></div>' +
    (need ? '<div class="pills" style="margin-top:24px"><button class="pill' + (reg ? ' on' : '') + '" type="button" data-act="authMode" data-id="register">Créer un compte</button><button class="pill' + (reg ? '' : ' on') + '" type="button" data-act="authMode" data-id="login">J\'ai déjà un compte</button></div>' : '') +
    '<div class="box" style="margin-top:16px">' +
    (reg ? '<label>Prénom<input id="a-prenom" autocomplete="given-name"></label><div class="two"><label>Nom<input id="a-nom" autocomplete="family-name"></label><label>Postnom<input id="a-postnom"></label></div><label>Nom de ta boutique<input id="a-boutique" placeholder="Ex. Grâce Créations"></label>' + loyerChoice('premiere_vente', 'a-mode') : '') +
    (need || !reg ? '<label>Numéro de téléphone<input id="a-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex. 0812 345 678"></label><label>Mot de passe<input id="a-pw" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" placeholder="6 caractères minimum"></label>' : '<input id="a-tel" type="hidden" value="">') +
    '<div class="msg-err hide" id="a-err"></div>' +
    '<button class="btn btn-primary" type="button" data-act="' + (reg ? 'register' : 'login') + '"><span>' + (reg ? 'Créer ma boutique' : 'Me connecter') + '</span></button>' +
    (reg ? '<p class="note center">Ton numéro sert d\'identifiant. Note bien ton mot de passe.</p>' : '<button class="linkbtn" type="button" data-act="forgot">Mot de passe oublié ?</button>') + '</div>');
  setBar(null);
}
function shopStatus(v) {
  var loyer = money((S.settings || {}).loyer || 15000, 'CDF');
  if (v.suspendu) return ['bad', 'Boutique suspendue', 'L\'administrateur a suspendu ta boutique. Contacte-le.'];
  var todo = [];
  if (v.mm_statut === 'vide') todo.push('ajoute tes numéros Mobile Money (onglet Boutique)');
  else if (v.mm_statut === 'attente') todo.push('tes numéros Mobile Money attendent la confirmation de l\'administrateur');
  else if (v.mm_statut === 'refuse') todo.push('tes numéros Mobile Money ont été refusés : corrige-les (onglet Boutique)');
  var ok = v.abo_fin && new Date(v.abo_fin + 'T23:59:59') >= new Date();
  if (!v.is_admin && !ok && v.loyer_mode !== 'premiere_vente') todo.push('paie ton loyer de ' + loyer + ' (onglet Loyer)');
  if (todo.length) return ['', 'Boutique pas encore en ligne', 'Il reste à faire : ' + todo.join(' ; ') + '.'];
  if (!v.is_admin && !ok && v.loyer_mode === 'premiere_vente') return ['ok', 'Boutique en ligne', 'Loyer à payer sur ta prochaine vente : elle arrivera chez cuervo.co, qui garde ' + loyer + ' et te reverse le reste.'];
  var left = v.is_admin ? 99 : Math.ceil((new Date(v.abo_fin + 'T23:59:59') - new Date()) / 864e5);
  if (left <= 5) return ['', 'Loyer bientôt à payer', 'Ta boutique est en ligne, mais ton loyer se termine le ' + fmtDate(v.abo_fin) + ' (' + (left <= 1 ? 'dernier jour' : 'dans ' + left + ' jours') + '). Paie ' + loyer + ' dans l\'onglet Loyer pour qu\'elle reste visible.'];
  return ['ok', 'Boutique en ligne', v.is_admin ? 'Compte administrateur : pas de loyer.' : 'Loyer payé jusqu\'au ' + fmtDate(v.abo_fin) + '.'];
}
async function pageAccount(alive) {
  skeleton(); await loadMe(); if (!alive()) return; header();
  if (!S.user || !S.vendor) { if (!S.settings) { var h = await sb.rpc('mk_home'); S.settings = { loyer: (h.data || {}).loyer || 15000, whatsapp: (h.data || {}).whatsapp || '' }; if (!alive()) return; } if (S.user && !S.vendor) S.ctx.auth = 'register'; return renderAuth(); }
  await loadDash(); if (!alive()) return;
  var dr = takeDraft();
  if (dr) {
    S.tab = 'produits'; renderDash();
    var base = dr.id && S.products.filter(function (x) { return x.id === dr.id; })[0];
    await openEditor(base || null); if (!E) return;
    E.p = Object.assign({}, E.p, dr.p); edRender();
    sheet($('sheetBody').innerHTML.replace('<div class="g12">', '<div class="g12"><div class="banner" style="margin:0"><b>Ton téléphone a rechargé la page</b>Ça arrive quand il manque de mémoire pendant le choix d\'un fichier. Tes informations sont gardées : choisis à nouveau ton fichier, ou mets-le sur Google Drive et colle le lien plus bas.</div>'));
    return;
  }
  renderDash();
}
function renderDash(keepScroll) {
  var v = S.vendor, st = shopStatus(v), y = window.scrollY;
  var pend = S.orders.filter(function (o) { return o.statut === 'attente'; }).length;
  var tabs = [['commandes', 'Commandes' + (pend ? ' · ' + pend : '')], ['produits', 'Produits'], ['boutique', 'Boutique'], ['loyer', 'Loyer']];
  var body = { commandes: dashOrders, produits: dashProducts, boutique: dashShop, loyer: dashRent }[S.tab]();
  page('<div class="rowx" style="padding-top:8px">' + avatar(v) + '<div class="grow"><h1 style="font-size:24px">' + esc(v.boutique) + '</h1><p class="note">' + esc(v.prenom + ' ' + v.nom) + '</p></div></div>' +
    '<div class="banner ' + st[0] + '"><b>' + st[1] + '</b>' + esc(st[2]) + '</div>' +
    '<div class="two" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="?b=' + esc(v.slug) + '" data-nav>Voir ma boutique</a><button class="btn btn-ghost btn-sm" type="button" data-act="newProduct">' + ico('i-plus') + '<span>Produit</span></button></div>' +
    (v.is_admin ? '<a class="btn btn-ghost btn-sm" style="margin-top:8px" href="?v=admin" data-nav>Espace administrateur ' + ico('i-arrow') + '</a>' : '') +
    '<div class="pills" style="margin-top:24px">' + tabs.map(function (t) { return '<button class="pill' + (t[0] === S.tab ? ' on' : '') + '" type="button" data-act="tab" data-id="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div style="margin-top:16px">' + body + '</div>' +
    '<button class="btn btn-ghost btn-sm" style="margin-top:40px" type="button" data-act="logout">Me déconnecter</button>');
  setBar(null); if (keepScroll) window.scrollTo({ top: y, behavior: 'instant' });
}
function dashOrders() {
  var done = S.orders.filter(function (o) { return o.statut === 'paye'; }), usd = 0, cdf = 0;
  done.forEach(function (o) { if (o.devise === 'CDF') cdf += Number(o.montant); else usd += Number(o.montant); });
  var h = '<div class="stats" style="margin:0 0 16px"><div class="stat"><b class="gt">' + done.length + '</b><span>ventes réussies</span></div><div class="stat"><b>' + money(usd, 'USD') + '</b><span>' + (cdf ? '+ ' + money(cdf, 'CDF') : 'encaissés') + '</span></div><div class="stat"><b>' + S.orders.filter(function (o) { return o.statut === 'attente'; }).length + '</b><span>à vérifier</span></div></div>';
  if (!S.orders.length) return h + '<div class="empty">Aucune commande pour l\'instant. Partage le lien de tes produits pour recevoir tes premiers clients.</div>';
  var st = { attente: ['a', 'À vérifier'], paye: ['g', 'Vente réussie'], refuse: ['r', 'Refusée'] };
  var rank = function (o) { return o.statut === 'attente' ? (o.capture_path ? 0 : 1) : 2; };
  return h + '<div class="g12 stag">' + S.orders.slice().sort(function (a, b) { return rank(a) - rank(b); }).map(function (o) {
    var s = st[o.statut] || st.attente, acts = '';
    if (o.pour_loyer) {
      var info = o.statut === 'attente' ? 'Cette vente paie ton loyer : le client paie cuervo.co, qui confirme la vente.' : o.statut === 'paye' ? ('Loyer retenu : ' + money(o.loyer_retenu || 0, 'CDF') + (o.a_reverser != null ? ' · reste pour toi : ' + money(o.a_reverser, 'CDF') : '') + (o.reverse_fait ? ' · reversé' : ' · en cours de reversement')) : '';
      return '<div class="ord"><div class="top"><div><b>' + esc(o.nom) + '</b><small>' + esc(o.tel) + ' · ' + (OPS[o.op] || '') + '</small><small>' + esc(o.titre) + ' · ' + money(o.montant, o.devise) + '</small></div><span class="tag ' + s[0] + '">' + s[1] + '</span></div><div class="banner" style="margin:0"><b>Vente-loyer</b>' + info + '</div></div>';
    }
    if (o.capture_path) acts += '<button class="btn btn-ghost btn-sm" type="button" data-act="viewCapture" data-path="' + esc(o.capture_path) + '">Voir la capture</button>';
    else if (o.statut === 'attente') acts += '<p class="note">Le client n\'a pas encore envoyé sa capture. Sans capture, la commande s\'efface toute seule après 48 heures.</p>';
    if (o.statut !== 'paye') acts += '<button class="btn btn-primary btn-sm" type="button" data-act="orderOk" data-id="' + o.id + '"><span>Argent reçu</span></button>';
    if (o.statut === 'attente') acts += '<button class="btn btn-ghost btn-sm" type="button" data-act="orderNo" data-id="' + o.id + '">Refuser</button>';
    if (o.statut === 'paye') acts += '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + waNum(o.tel) + '?text=' + encodeURIComponent('Bonjour ' + o.nom.split(' ')[0] + ', ton paiement est confirmé. Voici l\'accès à « ' + o.titre + ' » : ' + link('?c=' + o.token)) + '">Envoyer l\'accès sur WhatsApp</a>';
    return '<div class="ord"><div class="top"><div><b>' + esc(o.nom) + '</b><small>' + esc(o.tel) + ' · ' + (OPS[o.op] || '') + '</small><small>' + esc(o.titre) + ' · ' + money(o.montant, o.devise) + '</small></div><span class="tag ' + s[0] + '">' + s[1] + '</span></div>' + acts + '</div>';
  }).join('') + '</div>';
}
function dashProducts() {
  return '<button class="btn btn-primary" type="button" data-act="newProduct">' + ico('i-plus') + 'Nouveau produit</button>' +
    (S.products.length ? '<p class="note" style="margin-top:12px">Partage le lien de chaque produit : le client arrive directement sur le produit, et peut ensuite visiter ta boutique.</p>' : '') +
    '<div class="g12 stag" style="margin-top:16px">' +
    (S.products.length ? S.products.map(function (p) {
      return '<div class="ord"><div class="prow"><div class="sq">' + pic(p.image_url) + '</div><div style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.titre) + '</b><small>' + money(p.prix, p.devise) + ' · ' + p.ventes + ' vente' + (p.ventes > 1 ? 's' : '') + '</small>' +
        '<span class="tag ' + (p.bloque ? 'r' : p.actif ? 'g' : 'a') + '" style="margin-top:8px">' + (p.bloque ? 'Bloqué' : p.actif ? 'Publié' : 'Masqué') + '</span></div></div>' +
        '<div class="two"><button class="btn btn-ghost btn-sm" type="button" data-act="editProduct" data-id="' + p.id + '"><span>Modifier</span></button>' +
        '<button class="btn btn-primary btn-sm" type="button" data-act="shareProduct" data-id="' + p.id + '" data-title="' + esc(p.titre) + '" data-img="' + esc(safeUrl(p.image_url)) + '" data-prix="' + esc(bPrix(p)) + '">' + ico('i-share') + '<span>Partager</span></button></div></div>';
    }).join('') : '<div class="empty">Tu n\'as pas encore de produit. Ajoute le premier.</div>') + '</div>';
}
function upBox(key, url, label, cls) {
  return '<label class="up"><div class="' + cls + '" style="box-shadow:none">' + pic(url, label) + '</div><span class="lab">' + (safeUrl(url) ? 'Changer' : 'Ajouter') + '</span><input type="file" accept="image/*" data-up="' + key + '"></label>';
}
function dashShop() {
  var v = S.vendor, mm = { vide: ['a', 'À remplir'], attente: ['a', 'En attente de confirmation'], confirme: ['g', 'Confirmés'], refuse: ['r', 'Refusés'] }[v.mm_statut];
  return '<div class="g12"><div class="box"><h3>Photos de la boutique</h3><p class="note">Couverture de la page boutique (paysage 1920 × 1080) et photo de profil carrée. Chaque produit a aussi sa propre couverture.</p>' +
    upBox('cover', v.cover_url, 'Couverture de la boutique', 'cover') +
    '<div style="width:120px">' + upBox('avatar', v.avatar_url, 'Photo de profil', 'sq') + '</div></div>' +
    '<div class="box"><h3>Ma boutique</h3><label>Nom de la boutique<input id="s-boutique" value="' + esc(v.boutique) + '"></label><label>Présentation<textarea id="s-bio" placeholder="Ce que tu vends, en quelques mots">' + esc(v.bio) + '</textarea></label>' +
    '<label>Numéro WhatsApp pour les questions des clients<input id="s-wa" type="tel" value="' + esc(v.whatsapp) + '"></label><label>Numéro de téléphone affiché<input id="s-tel" type="tel" value="' + esc(v.tel) + '"></label></div>' +
    '<div class="box"><h3>Mes réseaux sociaux</h3><p class="note">Colle le lien de tes pages. Ils s\'affichent sur ta boutique et tes produits. Ton WhatsApp ci-dessus s\'affiche aussi.</p>' +
    RS.map(function (x) { return '<label>' + x[1] + '<input id="s-rs-' + x[0] + '" type="url" inputmode="url" placeholder="https://' + (x[0] === 'tiktok' ? 'www.tiktok.com/@ton_compte' : 'www.' + x[0] + '.com/ta_page') + '" value="' + esc((v.reseaux || {})[x[0]] || '') + '"></label>'; }).join('') + '</div>' +
    '<div class="box"><h3>Mon identité</h3><label>Prénom<input id="s-prenom" value="' + esc(v.prenom) + '"></label><div class="two"><label>Nom<input id="s-nom" value="' + esc(v.nom) + '"></label><label>Postnom<input id="s-postnom" value="' + esc(v.postnom) + '"></label></div></div>' +
    '<div class="box"><div class="rowx" style="justify-content:space-between"><h3>Mes Mobile Money</h3><span class="tag ' + mm[0] + '">' + mm[1] + '</span></div><p class="note">Tes clients paient sur ces numéros. L\'administrateur les confirme avant la mise en ligne, et après chaque modification.</p>' +
    '<label>Nom du compte<input id="s-mmnom" value="' + esc(v.mm_nom) + '"></label><label>Numéro M-Pesa<input id="s-mpesa" type="tel" value="' + esc(v.mpesa) + '"></label><label>Numéro Airtel Money<input id="s-airtel" type="tel" value="' + esc(v.airtel) + '"></label><label>Numéro Orange Money<input id="s-orange" type="tel" value="' + esc(v.orange) + '"></label></div>' +
    '<button class="btn btn-primary" type="button" data-act="saveShop"><span>Enregistrer</span></button>' +
    '<div class="box"><h3>Mon mot de passe</h3><label>Nouveau mot de passe<input id="s-pw" type="password" autocomplete="new-password" placeholder="6 caractères minimum"></label><button class="btn btn-ghost btn-sm" type="button" data-act="changePw"><span>Changer mon mot de passe</span></button></div></div>';
}
function dashRent() {
  var v = S.vendor, g = S.settings || {}, pend = S.subs.filter(function (s) { return s.statut === 'attente'; })[0];
  if (v.is_admin) return '<div class="banner ok"><b>Compte administrateur</b>Tu ne paies pas de loyer. Les loyers des vendeurs se confirment dans l\'espace administrateur.</div>';
  var ops = Object.keys(OPS).filter(function (k) { return g[k]; });
  var h = '<div class="box"><h3>Mode de paiement du loyer</h3>' + loyerChoice(v.loyer_mode, 'l-mode') + '<button class="btn btn-ghost btn-sm" type="button" data-act="saveMode"><span>Enregistrer mon choix</span></button>' +
    (v.loyer_mode === 'premiere_vente' && Number(v.loyer_cycle) > 0 ? '<p class="note">Déjà retenu sur la période : ' + money(v.loyer_cycle, 'CDF') + '.</p>' : '') + '</div>';
  h += '<div class="box"><h3>Loyer (40 jours) : ' + money(g.loyer, 'CDF') + '</h3><p class="note">' + (v.abo_fin ? 'Payé jusqu\'au ' + fmtDate(v.abo_fin) + '.' : 'Aucun loyer payé pour l\'instant.') + ' Chaque paiement confirmé ajoute 40 jours.</p>';
  if (pend) h += '<div class="banner"><b>Paiement en cours de vérification</b>Envoyé le ' + fmtDate(pend.created_at) + '. L\'administrateur va le confirmer.</div>';
  else if (v.loyer_mode === 'premiere_vente' && !(v.abo_fin && new Date(v.abo_fin + 'T23:59:59') >= new Date())) h += '<div class="banner ok"><b>Rien à payer maintenant</b>Ton loyer sera retenu sur ta prochaine vente. Tu peux aussi le payer tout de suite en choisissant « Tout de suite » ci-dessus.</div>';
  else if (!ops.length) h += '<div class="banner">Les numéros de paiement du loyer ne sont pas encore disponibles.</div>';
  else h += ops.map(function (k) { return '<div class="paynum"><small>' + OPS[k] + '</small><div class="n">' + esc(g[k]) + '</div>' + (g.mm_nom ? '<small>Nom du compte : ' + esc(g.mm_nom) + '</small>' : '') + '</div>'; }).join('') +
    '<label>Tu as payé avec<select id="l-op">' + ops.map(function (k) { return '<option value="' + k + '">' + OPS[k] + '</option>'; }).join('') + '</select></label>' +
    '<label>Référence de la transaction<input id="l-ref" placeholder="Code reçu par SMS"></label><label>Capture du paiement<input id="l-cap" type="file" accept="image/*"></label>' +
    '<button class="btn btn-primary" type="button" data-act="paySub"><span>Envoyer mon paiement</span></button>';
  h += '</div>';
  var hist = S.subs.filter(function (s) { return s.statut !== 'attente'; });
  if (hist.length) h += '<div class="sub">Historique</div><div class="g8">' + hist.map(function (s) { return '<div class="item"><span class="grow">' + fmtDate(s.created_at) + ' · ' + money(s.montant, 'CDF') + '</span><span class="tag ' + (s.statut === 'confirme' ? 'g' : 'r') + '">' + (s.statut === 'confirme' ? 'Confirmé' : 'Refusé') + '</span></div>'; }).join('') + '</div>';
  return h;
}

/* ---------- Éditeur de produit ---------- */
function localDT(v) { if (!v) return ''; var d = new Date(v); if (isNaN(d)) return ''; return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
async function edLoadFiles() { if (!E || !E.id) return; var r = await sb.from('mk_product_files').select('*').eq('product_id', E.id).order('created_at'); E.files = r.data || []; }
async function openEditor(p) {
  armed = '';
  E = { id: p ? p.id : null, files: [], p: p ? JSON.parse(JSON.stringify(p)) : { titre: '', description: '', points: [], prix: '', devise: 'USD', promo_prix: null, promo_fin: null, promo_places: null, image_url: '', cover_url: '', exemples: [], videos: [], actif: true, categorie: '', temoignages: [] } };
  edRender(); if (E.id) { await edLoadFiles(); if (E) edRender(); }
}
function edRead() {
  if (!E || !$('e-titre')) return;
  var p = E.p, num = function (k) { var v = $(k).value.trim(); return v === '' ? null : Number(v); };
  p.titre = $('e-titre').value.trim(); p.description = $('e-desc').value.trim();
  p.points = $('e-points').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12);
  p.prix = num('e-prix'); p.devise = $('e-devise').value; p.promo_prix = num('e-pprix'); p.promo_places = num('e-places');
  p.categorie = $('e-cat').value; if (!Array.isArray(p.temoignages)) p.temoignages = [];
  p.promo_fin = $('e-fin').value ? new Date($('e-fin').value).toISOString() : null; p.actif = $('e-actif').checked;
  document.querySelectorAll('[data-exleg]').forEach(function (i) { var e = p.exemples[Number(i.dataset.exleg)]; if (e) e.legende = i.value.trim(); });
}
function aiBlock() {
  if (E.ai === 'loading') return '<div class="ai g8"><div class="sk" style="height:84px"></div><div class="sk" style="height:84px"></div><div class="sk" style="height:84px"></div></div>';
  if (!Array.isArray(E.ai)) return '';
  return '<div class="ai g8 stag">' + E.ai.map(function (pr, i) {
    return '<div class="aip"><div class="rowx" style="justify-content:space-between"><b>' + esc(pr.style || ('Version ' + (i + 1))) + '</b><span class="tag g">' + (i + 1) + '/' + E.ai.length + '</span></div><p>' + esc(pr.description) + '</p>' +
      (pr.points.length ? '<ul class="ck">' + pr.points.map(function (t) { return '<li>' + ico('i-check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' : '') +
      '<button class="btn btn-primary btn-sm" type="button" data-act="edUseAI" data-i="' + i + '"><span>Utiliser cette version</span></button></div>';
  }).join('') + '<button class="btn btn-ghost btn-sm" type="button" data-act="edCloseAI">Fermer les propositions</button></div>';
}
function edRender() {
  var p = E.p, url = E.id ? plink(E.id) : '', keep = $('sheetRoot').querySelector('.sheet').scrollTop, was = $('sheetRoot').classList.contains('open') && $('e-titre');
  sheet('<div class="shead"><h2>' + (E.id ? 'Modifier le produit' : 'Nouveau produit') + '</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div><div class="g12">' +
    (E.id ? '<div class="box"><h3>Lien à partager</h3><div class="linkbox">' + esc(url) + '</div>' + shareRow(url, p.titre, safeUrl(p.image_url)) + '</div>' : '') +
    '<div class="box"><h3>Le produit</h3><label>Titre<input id="e-titre" maxlength="120" value="' + esc(p.titre) + '"></label>' +
    '<div class="two"><label>Prix<input id="e-prix" type="number" inputmode="decimal" min="0" step="any" value="' + (p.prix == null ? '' : p.prix) + '"></label><label>Devise<select id="e-devise"><option value="USD"' + (p.devise === 'USD' ? ' selected' : '') + '>Dollars ($)</option><option value="CDF"' + (p.devise === 'CDF' ? ' selected' : '') + '>Francs (FC)</option></select></label></div>' +
    '<label>Catégorie<select id="e-cat"><option value="">Choisir…</option>' + CATS.map(function (c) { return '<option' + (p.categorie === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>' +
    '<label>Description<textarea id="e-desc" maxlength="6000" placeholder="Écris quelques mots : l\'assistant peut les arranger pour toi.">' + esc(p.description) + '</textarea></label>' +
    '<label>Points forts (une ligne par point)<textarea id="e-points">' + esc((p.points || []).join('\n')) + '</textarea></label>' +
    '<button class="btn btn-ghost btn-sm" type="button" data-act="edAI"' + (E.ai === 'loading' ? ' disabled' : '') + '>' + ico('i-spark') + '<span>' + (E.ai === 'loading' ? 'L\'IA réfléchit…' : 'Proposer 3 versions avec l\'IA') + '</span></button>' +
    aiBlock() +
    '<div class="switch"><span>Visible dans ma boutique</span><input id="e-actif" type="checkbox"' + (p.actif ? ' checked' : '') + '></div></div>' +
    '<div class="box"><h3>Promotion limitée (facultatif)</h3><div class="two"><label>Prix promo<input id="e-pprix" type="number" inputmode="decimal" min="0" step="any" value="' + (p.promo_prix == null ? '' : p.promo_prix) + '"></label><label>Places<input id="e-places" type="number" inputmode="numeric" min="0" step="1" placeholder="Illimité" value="' + (p.promo_places == null ? '' : p.promo_places) + '"></label></div>' +
    '<label>Fin de la promo<input id="e-fin" type="datetime-local" value="' + localDT(p.promo_fin) + '"></label></div>' +
    '<div class="box"><h3>Photo de couverture du produit</h3><p class="note">Format paysage 1920 × 1080. Elle s\'affiche en haut de la page du produit.</p>' + upBox('pcover', p.cover_url, 'Photo de couverture', 'cover') + '</div>' +
    '<div class="box"><h3>Photo du produit (carrée)</h3><div style="width:160px">' + upBox('pimg', p.image_url, 'Photo du produit', 'sq') + '</div></div>' +
    '<div class="box"><h3>Photos d\'exemples</h3><div class="exgrid">' + p.exemples.map(function (e, i) { return '<div><div class="sq">' + pic(e.url) + '<button class="xs" style="position:absolute;right:8px;top:8px;background:rgba(14,14,11,.85)" type="button" data-act="edRmEx" data-i="' + i + '" aria-label="Retirer">' + ico('i-x') + '</button></div><input type="text" data-exleg="' + i + '" placeholder="Légende" value="' + esc(e.legende || '') + '"></div>'; }).join('') +
    (p.exemples.length < 4 ? '<div>' + upBox('pex', '', 'Ajouter un exemple', 'sq') + '</div>' : '') + '</div></div>' +
    '<div class="box"><h3>Vidéos explicatives</h3><p class="note">Comment utiliser ou installer le produit. 3 vidéos maximum. Une vidéo de plus de 50 Mo est compressée automatiquement. Formats : horizontale 16:9 ou verticale 9:16 (touche le format pour le changer).</p>' +
    p.videos.map(function (v, i) { return '<div class="item">' + ico('i-play') + '<span class="grow">' + esc(v.titre || v.url) + '</span><button class="fmt" type="button" data-act="edVidFmt" data-i="' + i + '" title="Changer le format">' + (v.format === '9:16' ? '9:16' : '16:9') + '</button><button class="xs" type="button" data-act="edRmVid" data-i="' + i + '" aria-label="Retirer">' + ico('i-x') + '</button></div>'; }).join('') +
    (p.videos.length < 3 ? '<label>Titre de la vidéo<input id="e-vtitre" placeholder="Ex. Comment installer"></label><label class="btn btn-ghost btn-sm filebtn"><span>Envoyer une vidéo depuis mon téléphone</span><input type="file" accept="video/*" data-up="pvid"></label>' +
      '<label>Ou un lien YouTube<input id="e-vurl" type="url" inputmode="url" placeholder="https://…"></label><label>Format de la vidéo<select id="e-vfmt"><option value="16:9">Horizontale (16:9)</option><option value="9:16">Verticale (9:16)</option></select></label><button class="btn btn-ghost btn-sm" type="button" data-act="edAddVidLink">Ajouter ce lien</button>' : '') + '</div>' +
    '<div class="box"><h3>Témoignages de clients</h3><p class="note">Recopie les vrais retours de tes clients, avec leur accord. 6 maximum.</p>' +
    (p.temoignages || []).map(function (t, i) { return '<div class="item"><span class="grow"><b>' + esc(t.nom || 'Client') + '</b> — ' + esc(t.texte) + '</span><button class="xs" type="button" data-act="edRmTem" data-i="' + i + '" aria-label="Retirer">' + ico('i-x') + '</button></div>'; }).join('') +
    ((p.temoignages || []).length < 6 ? '<label>Nom du client<input id="e-tnom" maxlength="60" placeholder="Ex. Grâce M."></label><label>Son témoignage<textarea id="e-ttexte" maxlength="400"></textarea></label><button class="btn btn-ghost btn-sm" type="button" data-act="edAddTem">Ajouter ce témoignage</button>' : '') + '</div>' +
    '<div class="box"><h3>Liens de téléchargement</h3><p class="note">Mets ton fichier sur Google Drive (ou un autre service), partage-le en « Tous les utilisateurs disposant du lien », puis colle le lien ici. Le client y accède dès que tu confirmes son paiement.</p>' +
    E.files.map(function (f) { return '<div class="item">' + ico('i-file') + '<span class="grow">' + esc(f.nom) + '</span><button class="xs" type="button" data-act="edRmFile" data-id="' + f.id + '" aria-label="Retirer">' + ico('i-x') + '</button></div>'; }).join('') +
    '<label>Lien de téléchargement<input id="e-furl" type="url" inputmode="url" placeholder="https://drive.google.com/…"></label><label>Nom affiché au client<input id="e-fnom" placeholder="Ex. Cours complet (PDF)"></label><button class="btn btn-ghost btn-sm" type="button" data-act="edAddLink"><span>Ajouter ce lien</span></button></div>' +
    '<button class="btn btn-primary" type="button" data-act="edSave"><span>Enregistrer le produit</span></button>' +
    (E.id ? '<button class="btn btn-danger btn-sm" type="button" data-act="edDelete">Supprimer ce produit</button>' : '') + '</div>');
  if (was) $('sheetRoot').querySelector('.sheet').scrollTop = keep;
}
async function edSave() {
  edRead(); var p = E.p;
  if (p.titre.length < 2) throw new Error('Donne un titre à ton produit.');
  if (!(p.prix > 0)) throw new Error('Indique le prix du produit.');
  if (p.promo_prix != null && !(p.promo_prix > 0 && p.promo_prix < p.prix)) throw new Error('Le prix promo doit être inférieur au prix normal.');
  var row = { titre: p.titre, description: p.description, points: p.points, prix: p.prix, devise: p.devise, promo_prix: p.promo_prix, promo_fin: p.promo_fin, promo_places: p.promo_places, image_url: p.image_url || '', cover_url: p.cover_url || '', exemples: p.exemples, videos: p.videos, actif: p.actif, categorie: p.categorie || '', temoignages: p.temoignages || [] };
  var r;
  if (E.id) r = await sb.from('mk_products').update(row).eq('id', E.id).select().single();
  else { row.vendor_id = S.user.id; r = await sb.from('mk_products').insert(row).select().single(); }
  if (r.error) throw r.error;
  E.id = r.data.id; E.p = JSON.parse(JSON.stringify(r.data));
}
document.addEventListener('change', async function (e) {
  var inp = e.target.closest('[data-up]'); if (!inp || !inp.files[0]) return;
  var f = inp.files[0], k = inp.dataset.up;
  try {
    if (k === 'cover' || k === 'avatar') {
      
      var url = k === 'cover' ? await upImage(f, 1280, 720, true) : await upImage(f, 480, 480, true), patch = {}; patch[k + '_url'] = url;
      var r = await sb.from('mk_vendors').update(patch).eq('id', S.user.id); if (r.error) throw r.error;
      S.vendor[k + '_url'] = url; renderDash(true); toast('Photo enregistrée');
    } else if (k === 'pcover') { edRead(); E.p.cover_url = await upImage(f, 1280, 720, true); edRender(); toast('Couverture ajoutée : pense à enregistrer'); }
    else if (k === 'pimg') { edRead(); E.p.image_url = await upImage(f, 800, 800, true); edRender(); toast('Photo ajoutée : pense à enregistrer'); }
    else if (k === 'pex') { edRead(); E.p.exemples.push({ url: await upImage(f, 800, 800, true), legende: '' }); edRender(); toast('Exemple ajouté : pense à enregistrer'); }
    else if (k === 'pvid') {
      edRead(); var t = $('e-vtitre').value.trim();
      var meta = await videoMeta(f), src = f;
      if (f.size > 48 * 1024 * 1024) {
        if (!meta.ok) throw new Error('Vidéo trop lourde : 50 Mo maximum. Raccourcis-la ou mets-la sur YouTube.');
        src = await compressVideo(f, meta);
        if (src.size > 48 * 1024 * 1024) throw new Error('Même compressée, la vidéo dépasse 50 Mo. Raccourcis-la ou mets-la sur YouTube et colle le lien.');
      }
      var ext = /webm/.test(src.type) ? 'webm' : /quicktime/.test(src.type) ? 'mov' : /3gp/.test(src.type) ? '3gp' : /matroska/.test(src.type) ? 'mkv' : 'mp4';
      var vu = await upload('mk-media', S.user.id + '/' + rnd() + '.' + ext, src, (src.type || 'video/mp4').split(';')[0], 'Envoi de la vidéo');
      if (!E) return; E.p.videos.push({ url: vu, titre: t, format: meta.h > meta.w ? '9:16' : '16:9' }); edRender(); toast('Vidéo ajoutée : pense à enregistrer');
    } else if (k === 'pfile') {
      if (f.size > 50 * 1024 * 1024) return toast('Fichier trop lourd : 50 Mo maximum');
      
      if (!E.id) await edSave();
      var safe = f.name.normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'fichier';
      var fu = await upload('mk-files', S.user.id + '/' + rnd() + rnd() + '/' + safe, f, f.type || 'application/octet-stream', 'Envoi de ' + f.name.slice(0, 40));
      var ins = await sb.from('mk_product_files').insert({ product_id: E.id, vendor_id: S.user.id, nom: f.name.slice(0, 150), url: fu, kind: 'fichier' }); if (ins.error) throw ins.error;
      edRead(); await edLoadFiles(); edRender(); dropDraft(); toast('Fichier ajouté');
    }
  } catch (err) { toast(errMsg(err)); }
});

/* ---------- Administration ---------- */
async function loadAdmin() {
  var rs = await Promise.all([sb.rpc('mk_admin_loyer_list'),sb.rpc('mk_admin_reports'),sb.from('mk_vendors').select('*').order('created_at', { ascending: false }), sb.from('mk_subs').select('*').eq('statut', 'attente').order('created_at'), loadSettings()]);
  S.adm = { lv: rs[0].data || [], reps: rs[1].data || [], vendors: rs[2].data || [], subs: rs[3].data || [] };
}
async function pageAdmin(alive) {
  skeleton(); await loadMe(); if (!alive()) return;
  if (!S.vendor || !S.vendor.is_admin) return notFound('Cet espace est réservé à l\'administrateur.');
  await loadAdmin(); if (!alive()) return; renderAdmin();
}
function renderAdmin() {
  var a = S.adm, byId = {}; a.vendors.forEach(function (v) { byId[v.id] = v; });
  var mm = a.vendors.filter(function (v) { return v.mm_statut === 'attente'; });
  var lvp = a.lv.filter(function (o) { return o.statut === 'attente'; }).length, lvr = a.lv.filter(function (o) { return o.statut === 'paye'; }).length;
  var repN = a.reps.filter(function (r) { return r.statut === 'nouveau'; }).length;
  var tabs = [['signal', 'Signalements' + (repN ? ' · ' + repN : '')], ['ventes', 'Ventes-loyer' + (lvp + lvr ? ' · ' + (lvp + lvr) : '')], ['confirmer', 'Mobile Money' + (mm.length ? ' · ' + mm.length : '')], ['loyers', 'Loyers payés' + (a.subs.length ? ' · ' + a.subs.length : '')], ['vendeurs', 'Vendeurs'], ['reglages', 'Réglages']], body = '';
  function who(v) { return '<b>' + esc(v.boutique) + '</b><small>' + esc([v.prenom, v.nom, v.postnom].filter(Boolean).join(' ')) + ' · ' + esc(v.tel) + '</small>'; }
  var loyerG = Number((S.settings || {}).loyer || 15000);
  if (S.atab === 'signal') body = '<p class="note" style="margin-bottom:12px">Ce que les clients signalent. Vérifie, puis bloque la boutique si c\'est une arnaque.</p>' + (a.reps.length ? '<div class="g12 stag">' + a.reps.map(function (r) {
    return '<div class="ord' + (r.statut === 'traite' ? ' done' : '') + '"><div class="top"><div><b>' + esc(r.motif) + '</b><small>' + esc(r.boutique || 'Boutique supprimée') + ' · ' + esc(r.titre || '') + '</small><small>' + fmtDate(r.created_at) + ' · ' + r.nb_boutique + ' signalement' + (r.nb_boutique > 1 ? 's' : '') + ' pour cette boutique' + (r.contact ? ' · Client : ' + esc(r.contact) : '') + '</small></div><span class="tag ' + (r.suspendu ? 'r">Bloquée' : r.statut === 'nouveau' ? 'a">Nouveau' : 'g">Classé') + '</span></div>' +
      (r.details ? '<p class="desc" style="margin:0">' + esc(r.details) + '</p>' : '') +
      '<div class="two">' + (r.product_id ? '<a class="btn btn-ghost btn-sm" href="?p=' + esc(r.product_id) + '" data-nav>Voir le produit</a>' : '<span></span>') + (r.vendor_id ? '<button class="btn ' + (r.suspendu ? 'btn-ghost' : 'btn-danger') + ' btn-sm" type="button" data-act="admVendor" data-do="' + (r.suspendu ? 'reactiver' : 'suspendre') + '" data-id="' + r.vendor_id + '">' + (r.suspendu ? 'Débloquer' : 'Bloquer la boutique') + '</button>' : '<span></span>') + '</div>' +
      (r.statut === 'nouveau' ? '<button class="btn btn-ghost btn-sm" type="button" data-act="admRepDone" data-id="' + r.id + '"><span>Marquer comme traité</span></button>' : '') + '</div>';
  }).join('') + '</div>' : '<div class="empty">Aucun signalement. Tout va bien.</div>');
  else if (S.atab === 'ventes') body = '<p class="note" style="margin-bottom:12px">Ventes des boutiques en mode « première vente » : le client a payé sur tes numéros. Garde le loyer (au plus ' + money(loyerG, 'CDF') + ' pour 40 jours), puis reverse le reste au vendeur.</p>' + (a.lv.length ? '<div class="g12 stag">' + a.lv.map(function (o) {
    var resteLoyer = Math.max(0, loyerG - Number(o.loyer_cycle || 0)), def = o.devise === 'CDF' ? Math.min(resteLoyer, Number(o.montant)) : resteLoyer;
    var head = '<div class="top"><div><b>' + esc(o.boutique) + '</b><small>Client : ' + esc(o.nom) + ' · ' + esc(o.tel) + ' · ' + (OPS[o.op] || '') + '</small><small>' + esc(o.titre) + ' · ' + money(o.montant, o.devise) + '</small></div><span class="tag ' + (o.statut === 'attente' ? 'a">À vérifier' : 'g">À reverser') + '</span></div>';
    if (o.statut === 'attente') return '<div class="ord">' + head + (o.capture_path ? '<button class="btn btn-ghost btn-sm" type="button" data-act="viewCapture" data-path="' + esc(o.capture_path) + '">Voir la capture</button>' : '<p class="note">Pas encore de capture.</p>') +
      '<label>Montant gardé pour le loyer (FC)<input id="ret-' + o.id + '" type="number" inputmode="numeric" min="0" max="' + resteLoyer + '" value="' + def + '"></label><p class="note">Loyer restant sur la période pour cette boutique : ' + money(resteLoyer, 'CDF') + (o.devise === 'USD' ? '. Vente en dollars : convertis toi-même le reste à reverser.' : '') + '</p>' +
      '<div class="two"><button class="btn btn-primary btn-sm" type="button" data-act="admLV" data-ok="1" data-id="' + o.id + '"><span>Argent reçu</span></button><button class="btn btn-ghost btn-sm" type="button" data-act="admLV" data-ok="0" data-id="' + o.id + '">Refuser</button></div></div>';
    var nums = Object.keys(OPS).filter(function (k) { return o['v_' + k]; }).map(function (k) { return OPS[k] + ' : ' + esc(o['v_' + k]); }).join(' · ');
    var wa = waNum(o.vendeur_tel), rest = o.a_reverser != null ? money(o.a_reverser, 'CDF') : 'le reste';
    return '<div class="ord">' + head + '<div class="banner" style="margin:0"><b>À reverser : ' + rest + '</b>Loyer gardé : ' + money(o.loyer_retenu || 0, 'CDF') + (nums ? '<br>Numéros du vendeur : ' + nums + (o.mm_nom ? ' (' + esc(o.mm_nom) + ')' : '') : '') + '</div>' +
      (wa ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent('Bonjour, ta vente « ' + o.titre + ' » est confirmée. cuervo.co a gardé ' + money(o.loyer_retenu || 0, 'CDF') + ' pour ton loyer et t\'envoie ' + rest + '.') + '"><span>Prévenir le vendeur</span></a>' : '') +
      '<button class="btn btn-primary btn-sm" type="button" data-act="admRev" data-id="' + o.id + '"><span>Reste envoyé au vendeur</span></button></div>';
  }).join('') + '</div>' : '<div class="empty">Aucune vente-loyer à traiter.</div>');
  else if (S.atab === 'confirmer') body = mm.length ? '<div class="g12 stag">' + mm.map(function (v) {
    return '<div class="ord"><div>' + who(v) + '</div><div class="g8">' + (v.mm_nom ? '<div class="item"><span class="grow">Nom du compte : ' + esc(v.mm_nom) + '</span></div>' : '') +
      Object.keys(OPS).filter(function (k) { return v[k]; }).map(function (k) { return '<div class="item"><span class="grow">' + OPS[k] + ' : ' + esc(v[k]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="two"><button class="btn btn-primary btn-sm" type="button" data-act="admVendor" data-do="mm_ok" data-id="' + v.id + '"><span>Confirmer</span></button><button class="btn btn-ghost btn-sm" type="button" data-act="admVendor" data-do="mm_non" data-id="' + v.id + '">Refuser</button></div></div>';
  }).join('') + '</div>' : '<div class="empty">Aucun numéro Mobile Money à confirmer.</div>';
  else if (S.atab === 'loyers') body = a.subs.length ? '<div class="g12 stag">' + a.subs.map(function (s) {
    var v = byId[s.vendor_id] || { boutique: 'Vendeur', prenom: '', nom: '', tel: '' };
    return '<div class="ord"><div class="top"><div>' + who(v) + '<small>' + (OPS[s.op] || '') + (s.ref ? ' · Réf. ' + esc(s.ref) : '') + ' · ' + fmtDate(s.created_at) + '</small></div><span class="tag a">' + money(s.montant, 'CDF') + '</span></div>' +
      (s.capture_path ? '<button class="btn btn-ghost btn-sm" type="button" data-act="viewCapture" data-path="' + esc(s.capture_path) + '">Voir la capture</button>' : '<p class="note">Pas de capture : vérifie avec la référence.</p>') +
      '<div class="two"><button class="btn btn-primary btn-sm" type="button" data-act="admSub" data-ok="1" data-id="' + s.id + '"><span>Loyer reçu</span></button><button class="btn btn-ghost btn-sm" type="button" data-act="admSub" data-ok="0" data-id="' + s.id + '">Refuser</button></div></div>';
  }).join('') + '</div>' : '<div class="empty">Aucun loyer à confirmer.</div>';
  else if (S.atab === 'vendeurs') body = '<div class="pills" style="margin:0 0 12px"><button class="pill' + (S.vf !== 'impaye' ? ' on' : '') + '" type="button" data-act="vf" data-id="">Tous</button><button class="pill' + (S.vf === 'impaye' ? ' on' : '') + '" type="button" data-act="vf" data-id="impaye">Loyer non payé</button></div><div class="g12 stag">' + a.vendors.filter(function (v) { return S.vf !== 'impaye' || (!v.is_admin && !(v.abo_fin && new Date(v.abo_fin + 'T23:59:59') >= new Date())); }).map(function (v) {
    var ok = v.abo_fin && new Date(v.abo_fin + 'T23:59:59') >= new Date();
    return '<div class="ord"><div class="top"><div>' + who(v) + '<small>' + (v.is_admin ? 'Administrateur' : ok ? 'Loyer payé jusqu\'au ' + fmtDate(v.abo_fin) : 'Loyer non payé' + (v.loyer_mode === 'premiere_vente' ? ' (sur 1re vente)' : '')) + ' · Mobile Money : ' + v.mm_statut + '</small></div>' + (v.suspendu ? '<span class="tag r">Suspendu</span>' : '') + '</div>' +
      '<div class="two"><a class="btn btn-ghost btn-sm" href="?b=' + esc(v.slug) + '" data-nav>Voir</a>' + (v.is_admin ? '<span></span>' : '<button class="btn ' + (v.suspendu ? 'btn-ghost' : 'btn-danger') + ' btn-sm" type="button" data-act="admVendor" data-do="' + (v.suspendu ? 'reactiver' : 'suspendre') + '" data-id="' + v.id + '">' + (v.suspendu ? 'Débloquer' : 'Bloquer la boutique') + '</button>') + '</div>' +
      (v.is_admin ? '' : '<button class="btn btn-ghost btn-sm" type="button" data-act="admReset" data-id="' + v.id + '" data-tel="' + esc(v.tel) + '" data-name="' + esc(v.boutique) + '">Donner un nouveau mot de passe</button>') + '</div>';
  }).join('') + '</div>';
  else { var g = S.settings || {}; body = '<div class="box"><h3>Loyer et paiement des vendeurs</h3><label>Loyer (40 jours) (FC)<input id="g-loyer" type="number" inputmode="decimal" min="0" step="any" value="' + esc(g.loyer) + '"></label><p class="note">Les vendeurs paient leur loyer sur ces numéros.</p>' +
    '<label>Nom du compte<input id="g-nom" value="' + esc(g.mm_nom) + '"></label><label>Numéro M-Pesa<input id="g-mpesa" type="tel" value="' + esc(g.mpesa) + '"></label><label>Numéro Airtel Money<input id="g-airtel" type="tel" value="' + esc(g.airtel) + '"></label><label>Numéro Orange Money<input id="g-orange" type="tel" value="' + esc(g.orange) + '"></label>' +
    '<label>Ton WhatsApp<input id="g-wa" type="tel" value="' + esc(g.whatsapp) + '"></label><p class="note">Ces numéros reçoivent aussi les ventes-loyer des boutiques en mode « première vente ». Ton WhatsApp sert pour « Mot de passe oublié » et pour les clients des ventes-loyer.</p><button class="btn btn-primary" type="button" data-act="admSettings"><span>Enregistrer</span></button></div>' +
    '<div class="box" style="margin-top:12px"><h3>Pages d\'aide</h3><a class="btn btn-ghost btn-sm" href="?v=aide" data-nav><span>Voir la page « Comment ça marche »</span></a><button class="btn btn-ghost btn-sm" type="button" data-act="explainer"><span>Voir la vidéo de 15 secondes</span></button></div>'; }
  page('<a class="note rowx" style="padding-top:8px" href="?v=compte" data-nav>' + ico('i-back') + 'Ma boutique</a><h1 style="margin-top:12px">Administration</h1>' +
    '<div class="stats"><div class="stat"><b class="gt">' + a.vendors.length + '</b><span>vendeurs</span></div><div class="stat"><b>' + mm.length + '</b><span>Mobile Money à confirmer</span></div><div class="stat"><b>' + a.subs.length + '</b><span>loyers à confirmer</span></div><div class="stat"><b' + (repN ? ' style="color:var(--err,#E5484D)"' : '') + '>' + repN + '</b><span>signalements</span></div></div>' +
    '<div class="pills" style="margin-top:24px">' + tabs.map(function (t) { return '<button class="pill' + (t[0] === S.atab ? ' on' : '') + '" type="button" data-act="atab" data-id="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div style="margin-top:16px">' + body + '</div>');
  setBar(null);
}

/* ---------- Visionneuse de photos ---------- */
var ZV = { s: 1, x: 0, y: 0, pts: {}, d0: 0, s0: 1, last: 0, mx: 0, my: 0 };
function zApply(anim) { var im = $('zvImg'); if (!im) return; im.style.transition = anim ? 'transform 220ms cubic-bezier(.22,1,.36,1)' : 'none'; im.style.transform = 'translate(' + ZV.x + 'px,' + ZV.y + 'px) scale(' + ZV.s + ')'; }
function zClamp() {
  ZV.s = Math.min(5, Math.max(1, ZV.s));
  var im = $('zvImg'), mx = im.offsetWidth * (ZV.s - 1) / 2, my = im.offsetHeight * (ZV.s - 1) / 2;
  ZV.x = Math.min(mx, Math.max(-mx, ZV.x)); ZV.y = Math.min(my, Math.max(-my, ZV.y));
}
function openZoom(url) {
  var v = $('zv'); ZV.s = 1; ZV.x = ZV.y = 0; ZV.pts = {};
  v.innerHTML = '<img id="zvImg" src="' + esc(url) + '" alt="" draggable="false"><button class="x zx" type="button" data-act="closeZoom" aria-label="Fermer">' + ico('i-x') + '</button><p class="zh">Pince pour zoomer · double toucher</p>';
  v.classList.add('on'); document.body.style.overflow = 'hidden';
  try { history.pushState({ zoom: 1 }, '', location.href); } catch (e) {}
}
function closeZoom(fromPop) {
  var v = $('zv'); if (!v.classList.contains('on')) return false;
  v.classList.remove('on'); document.body.style.overflow = ''; setTimeout(function () { if (!v.classList.contains('on')) v.innerHTML = ''; }, 260);
  if (!fromPop) { try { if (history.state && history.state.zoom) history.back(); } catch (e) {} }
  return true;
}
A.closeZoom = function () { closeZoom(false); };
(function () {
  var v = $('zv');
  v.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    v.setPointerCapture(e.pointerId); ZV.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ZV.pts);
    if (ids.length === 2) { var a = ZV.pts[ids[0]], b = ZV.pts[ids[1]]; ZV.d0 = Math.hypot(a.x - b.x, a.y - b.y); ZV.s0 = ZV.s; }
    if (ids.length === 1) {
      var now = Date.now();
      if (now - ZV.last < 300) { ZV.s = ZV.s > 1 ? 1 : 2.5; if (ZV.s === 1) { ZV.x = ZV.y = 0; } else { var r = v.getBoundingClientRect(); ZV.x = (r.width / 2 - e.clientX) * 1.5; ZV.y = (r.height / 2 - e.clientY) * 1.5; } zClamp(); zApply(true); ZV.last = 0; }
      else ZV.last = now;
      ZV.mx = e.clientX; ZV.my = e.clientY;
    }
  });
  v.addEventListener('pointermove', function (e) {
    if (!ZV.pts[e.pointerId]) return;
    ZV.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ZV.pts);
    if (ids.length === 2 && ZV.d0) { var a = ZV.pts[ids[0]], b = ZV.pts[ids[1]]; ZV.s = ZV.s0 * Math.hypot(a.x - b.x, a.y - b.y) / ZV.d0; zClamp(); zApply(false); }
    else if (ids.length === 1 && ZV.s > 1) { ZV.x += e.clientX - ZV.mx; ZV.y += e.clientY - ZV.my; ZV.mx = e.clientX; ZV.my = e.clientY; zClamp(); zApply(false); }
  });
  var up = function (e) { delete ZV.pts[e.pointerId]; if (Object.keys(ZV.pts).length < 2) ZV.d0 = 0; var ids = Object.keys(ZV.pts); if (ids.length === 1) { ZV.mx = ZV.pts[ids[0]].x; ZV.my = ZV.pts[ids[0]].y; } };
  v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
  v.addEventListener('wheel', function (e) { e.preventDefault(); ZV.s *= e.deltaY < 0 ? 1.15 : 0.87; zClamp(); zApply(false); }, { passive: false });
})();
document.addEventListener('click', function (e) {
  var zz = e.target.closest('[data-zoom]');
  if (zz && zz.dataset.zoom && !e.target.closest('a,button,label,input')) { e.preventDefault(); openZoom(zz.dataset.zoom); }
});

/* ---------- Événements et démarrage ---------- */
document.addEventListener('click', function (e) {
  var a = e.target.closest('a[data-nav]');
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); var h = a.getAttribute('href'); nav(h === './' ? location.pathname : h); return; }
  var el = e.target.closest('[data-act]'); if (!el) return;
  var f = A[el.dataset.act]; if (f) Promise.resolve(f(el, e)).catch(function (err) { busy(el, false); toast(errMsg(err)); });
});
header();
loadMe().catch(function () {}).then(function () { header(); route(); });
})();
