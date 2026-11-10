/* cuervo.co — place de marché. Données : Supabase (tables mk_*). */
(function () {
'use strict';
var SB_URL = 'https://eebqtggnmuzfrwgunpsa.supabase.co';
var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnF0Z2dubXV6ZnJ3Z3VucHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NzI0NTQsImV4cCI6MjEwNzM0ODQ1NH0.tuCugIF_T1uVXXsWs96JwKJ1m_r-Pru477n7cP1sb1Y';
var sb = window.supabase.createClient(SB_URL, SB_KEY);
var OPS = { mpesa: 'M-Pesa', airtel: 'Airtel Money', orange: 'Orange Money' };
var S = { user: null, vendor: null, settings: null, tab: 'commandes', atab: 'confirmer', ctx: {}, orders: [], products: [], subs: [] };
var E = null;            // produit en cours d'édition
var rid = 0, pollT = null, armed = '';
var $ = function (id) { return document.getElementById(id); };
var app = $('app');

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
function busy(btn, on, label) { if (!btn) return; btn.disabled = on; btn.classList.toggle('busy', on); if (label) btn.lastChild.textContent = label; }
function errMsg(e) {
  var m = (e && (e.message || e.error_description)) || '';
  if (/Invalid login/i.test(m)) return 'Numéro ou mot de passe incorrect.';
  if (/already registered/i.test(m)) return 'Ce numéro a déjà un compte. Connecte-toi.';
  if (/Password should/i.test(m)) return 'Le mot de passe doit avoir au moins 6 caractères.';
  if (/mime|size|exceeded|too large/i.test(m)) return 'Fichier refusé : trop lourd ou format non accepté.';
  if (/fetch|network/i.test(m)) return 'Connexion internet instable. Réessaie.';
  return m || 'Une erreur est survenue. Réessaie.';
}
function setBar(html) { $('bar').classList.toggle('hide', !html); document.body.classList.toggle('has-bar', !!html); $('barIn').innerHTML = html || ''; }
function sheet(html) { $('sheetBody').innerHTML = html; $('sheetRoot').classList.add('open'); $('sheetRoot').querySelector('.sheet').scrollTop = 0; }
function closeSheet() { $('sheetRoot').classList.remove('open'); E = null; }
function page(html) { app.innerHTML = '<div class="page">' + html + '</div>'; window.scrollTo(0, 0); tick(); countUp(); }
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
function countUp() {
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var to = Number(el.dataset.count) || 0, t0 = null; el.removeAttribute('data-count');
    if (to < 2 || window.matchMedia('(prefers-reduced-motion:reduce)').matches) { el.textContent = to; return; }
    function f(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  });
}
function header() {
  $('hAccount').innerHTML = ico('i-store') + (S.vendor ? 'Ma boutique' : 'Vendre');
  var has = tokens().length > 0; $('hOrders').classList.toggle('hide', !has); $('hOrders').innerHTML = ico('i-bag');
}

/* ---------- Photos et fichiers ---------- */
function toJpeg(file, W, H, crop) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var w = W, h = H, s;
      if (crop) s = Math.max(W / im.width, H / im.height);
      else { s = Math.min(1, W / im.width, H / im.height); w = Math.round(im.width * s); h = Math.round(im.height * s); }
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, (w - im.width * s) / 2, (h - im.height * s) / 2, im.width * s, im.height * s);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) { b ? res(b) : rej(new Error('Image illisible')); }, 'image/jpeg', .84);
    };
    im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
    im.src = url;
  });
}
function rnd() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
async function upload(bucket, path, blob, type) {
  var r = await sb.storage.from(bucket).upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (r.error) throw r.error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
async function upImage(file, W, H, crop) { var b = await toJpeg(file, W, H, crop); return upload('mk-media', S.user.id + '/' + rnd() + '.jpg', b, 'image/jpeg'); }

/* ---------- Navigation ---------- */
function nav(q) { history.pushState({}, '', q || location.pathname); route(); }
window.addEventListener('popstate', route);
async function route() {
  var my = ++rid, alive = function () { return my === rid; };
  clearInterval(pollT); closeSheet(); armed = '';
  var q = new URLSearchParams(location.search), v = q.get('v');
  try {
    if (q.get('p')) return await pageProduct(q.get('p'), alive);
    if (q.get('b')) return await pageShop(q.get('b'), alive);
    if (q.get('c')) return await pageOrder(q.get('c'), alive);
    if (v === 'compte') return await pageAccount(alive);
    if (v === 'admin') return await pageAdmin(alive);
    if (v === 'achats') return await pagePurchases(alive);
    return await pageHome(alive);
  } catch (e) { if (alive()) notFound(errMsg(e)); }
}

/* ---------- Accueil ---------- */
function card(p) {
  return '<a class="card" href="?p=' + esc(p.id) + '" data-nav><div class="sq">' + (p.promo ? '<span class="flag badge">Promo</span>' : '') + pic(p.image_url) + '</div><div class="b"><h3>' + esc(p.titre) + '</h3>' +
    '<div class="p">' + money(p.prix_actuel, p.devise) + (p.promo ? '<s>' + money(p.prix, p.devise) + '</s>' : '') + '</div>' +
    '<div class="m">' + (p.ventes > 0 ? p.ventes + ' vendu' + (p.ventes > 1 ? 's' : '') : 'Nouveau') + (p.boutique ? ' · ' + esc(p.boutique) : '') + '</div></div></a>';
}
function sellCta(loyer) {
  return '<div class="cta sec"><div class="kicker">Vendeurs</div><h2>Ouvre ta boutique en ligne</h2><p class="lead" style="margin:8px 0 16px">Publie tes produits, partage ton lien sur WhatsApp et Facebook, et reçois tes paiements par Mobile Money. Loyer : ' + money(loyer, 'USD') + ' par mois.</p>' +
    '<a class="btn btn-primary" href="?v=compte" data-nav>' + (S.vendor ? 'Gérer ma boutique' : 'Créer ma boutique') + ' ' + ico('i-arrow') + '</a></div>';
}
async function pageHome(alive) {
  skeleton();
  var r = await sb.rpc('mk_home'); if (!alive()) return;
  if (r.error) throw r.error;
  var d = r.data || { products: [], loyer: 10 }, ps = d.products || [];
  page('<div style="padding-top:8px"><div class="kicker">Boutiques en ligne</div><h1>Achète et vends en ligne, paie par <span class="gt">Mobile Money</span>.</h1>' +
    '<p class="lead" style="margin-top:12px">Formations, fichiers, applications et produits de créateurs de la RDC.</p></div>' +
    '<div class="sec"><h2 style="margin-bottom:16px">Derniers produits</h2>' +
    (ps.length ? '<div class="grid stag">' + ps.map(card).join('') + '</div>' : '<div class="empty">Aucun produit en ligne pour l\'instant. Sois le premier à ouvrir ta boutique.</div>') + '</div>' + sellCta(d.loyer));
}

/* ---------- Produit ---------- */
function ytId(u) { var m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/.exec(u); return m ? m[1] : ''; }
function videoHtml(v) {
  var u = safeUrl(v && v.url); if (!u) return '';
  var y = ytId(u), t = v.titre ? '<p class="vt">' + esc(v.titre) + '</p>' : '';
  if (y) return '<div><div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/' + y + '" allowfullscreen loading="lazy" title="Vidéo"></iframe></div>' + t + '</div>';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) return '<div><div class="vid"><video controls playsinline preload="metadata" src="' + esc(u) + '"></video></div>' + t + '</div>';
  return '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="' + esc(u) + '">' + ico('i-play') + esc(v.titre || 'Voir la vidéo') + '</a>';
}
function shareRow(url, text) {
  var u = encodeURIComponent(url);
  return '<div class="g8"><div class="two"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text + ' ' + url) + '">WhatsApp</a>' +
    '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + u + '">Facebook</a></div>' +
    '<button class="btn btn-ghost btn-sm" type="button" data-act="copy" data-text="' + esc(url) + '">' + ico('i-share') + 'Copier le lien</button></div>';
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
  document.title = p.titre + ' — ' + s.boutique;
  page(
    (d.apercu ? '<div class="banner"><b>Aperçu</b>Ce produit n\'est pas encore visible du public' + (d.bloque ? ' : il a été bloqué par l\'administrateur.' : '. Vérifie le loyer et les numéros Mobile Money de la boutique.') + '</div><div style="height:16px"></div>' : '') +
    '<div class="cover">' + (safeUrl(s.cover_url) ? pic(s.cover_url) : '<div class="ph"><div><b>' + esc(s.boutique) + '</b></div></div>') + '</div>' +
    '<div class="stats"><div class="stat"><b class="gt" data-count="' + (p.ventes || 0) + '">0</b><span>ventes de ce produit</span></div><div class="stat"><b data-count="' + (s.ventes || 0) + '">0</b><span>ventes de la boutique</span></div><div class="stat"><b>' + (d.autres.length + 1) + '</b><span>produit' + (d.autres.length ? 's' : '') + ' en boutique</span></div></div>' +
    '<a class="shoprow" href="?b=' + esc(s.slug) + '" data-nav>' + avatar(s) + '<div class="grow"><b>' + esc(s.boutique) + '</b><small>Voir la boutique et ses autres produits</small></div>' + ico('i-arrow') + '</a>' +
    '<article class="prod"><div class="phead"><div class="sq">' + pic(p.image_url) + '</div><div><span class="tag g">' + (p.ventes > 0 ? p.ventes + ' achat' + (p.ventes > 1 ? 's' : '') : 'Nouveau') + '</span><h1>' + esc(p.titre) + '</h1>' +
    '<div class="price-row" style="margin-top:8px"><div class="price">' + money(p.prix_actuel, p.devise) + '</div>' + (p.promo ? '<div class="old">' + money(p.prix, p.devise) + '</div>' : '') + '</div></div></div>' + promo +
    (p.description ? '<div class="sub">Description</div><p class="desc">' + esc(p.description) + '</p>' : '') +
    ((p.points || []).length ? '<div class="sub">Les points forts</div><ul class="ck">' + p.points.map(function (t) { return '<li>' + ico('i-check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>' : '') +
    (vids.length ? '<div class="sub">Vidéos explicatives</div><div class="g16">' + vids.join('') + '</div>' : '') +
    (exs.length ? '<div class="sub">Exemples</div><div class="exs">' + exs.map(function (e) { return '<figure class="ex"><div class="sq">' + pic(e.url) + '</div>' + (e.legende ? '<figcaption>' + esc(e.legende) + '</figcaption>' : '') + '</figure>'; }).join('') + '</div>' : '') +
    (canPay ? '<button class="btn btn-primary" style="margin-top:24px" type="button" data-act="pay">Payer ' + money(p.prix_actuel, p.devise) + ' ' + ico('i-arrow') + '</button>' : '<div class="banner">Le paiement n\'est pas encore disponible pour ce produit.</div>') +
    '</article>' +
    '<div class="sec g12"><h2>Une question ?</h2>' + (contactRow(s) || '<p class="lead">Le vendeur n\'a pas encore indiqué de contact.</p>') + '</div>' +
    '<div class="sec g12"><h2>Partager ce produit</h2>' + shareRow(link('?p=' + p.id), p.titre) + '</div>' +
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
    '<div class="cover">' + (safeUrl(s.cover_url) ? pic(s.cover_url) : '<div class="ph"><div><b>' + esc(s.boutique) + '</b></div></div>') + '</div>' +
    '<div style="padding:0 8px">' + avatar(s, 'lg') + '<h1 style="margin-top:12px">' + esc(s.boutique) + '</h1><p class="note" style="margin-top:4px">Par ' + esc(s.vendeur) + '</p>' + (s.bio ? '<p class="lead" style="margin-top:12px;white-space:pre-line">' + esc(s.bio) + '</p>' : '') + '</div>' +
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
  closeSheet: closeSheet,
  copy: function (el) { try { navigator.clipboard.writeText(el.dataset.text).then(function () { toast('Lien copié'); }, function () { toast('Copie impossible sur cet appareil'); }); } catch (e) { toast('Copie impossible sur cet appareil'); } },
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
      var u = await sb.storage.from('mk-captures').upload(path, blob, { contentType: 'image/jpeg' }); if (u.error) throw u.error;
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
      await loadMe(); header(); S.tab = 'boutique'; toast('Boutique créée'); route();
    } catch (e) { busy(el, false); err.textContent = errMsg(e); err.classList.remove('hide'); }
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
  editProduct: function (el) { openEditor(S.products.filter(function (p) { return p.id === el.dataset.id; })[0]); },
  edSave: async function (el) { busy(el, true); try { await edSave(); toast('Produit enregistré'); edRender(); await loadDash(); if (S.tab === 'produits') renderDash(true); } catch (e) { toast(errMsg(e)); } busy(el, false); },
  edDelete: async function (el) {
    if (armed !== 'del') { armed = 'del'; el.textContent = 'Confirmer la suppression'; return; }
    var r = await sb.from('mk_products').delete().eq('id', E.id); if (r.error) return toast(errMsg(r.error));
    closeSheet(); toast('Produit supprimé'); await loadDash(); renderDash();
  },
  edRmEx: function (el) { edRead(); E.p.exemples.splice(Number(el.dataset.i), 1); edRender(); },
  edRmVid: function (el) { edRead(); E.p.videos.splice(Number(el.dataset.i), 1); edRender(); },
  edAddVidLink: function () {
    edRead(); var u = safeUrl($('e-vurl').value);
    if (!u) return toast('Colle un lien complet qui commence par https://');
    if (E.p.videos.length >= 3) return toast('3 vidéos maximum');
    E.p.videos.push({ url: u, titre: $('e-vtitre').value.trim() }); edRender();
  },
  edAddLink: async function (el) {
    var u = safeUrl($('e-furl').value), n = $('e-fnom').value.trim();
    if (!u) return toast('Colle un lien complet qui commence par https://');
    busy(el, true);
    try { if (!E.id) await edSave(); var r = await sb.from('mk_product_files').insert({ product_id: E.id, vendor_id: S.user.id, nom: n || 'Lien de téléchargement', url: u, kind: 'lien' }); if (r.error) throw r.error; await edLoadFiles(); edRender(); toast('Lien ajouté'); }
    catch (e) { toast(errMsg(e)); }
    busy(el, false);
  },
  edRmFile: async function (el) { var r = await sb.from('mk_product_files').delete().eq('id', el.dataset.id); if (r.error) return toast(errMsg(r.error)); edRead(); await edLoadFiles(); edRender(); },
  edAI: async function (el) {
    edRead(); if (!E.p.titre && !E.p.description) return toast('Écris d\'abord un titre ou quelques mots sur ton produit');
    busy(el, true);
    var r = await sb.functions.invoke('mk-ai', { body: { titre: E.p.titre, description: E.p.description } });
    busy(el, false);
    if (r.error || !r.data || r.data.error) {
      var m = r.data && r.data.error; try { if (!m && r.error && r.error.context) m = (await r.error.context.json()).error; } catch (e) {}
      return toast(m || 'L\'assistant IA n\'est pas disponible pour le moment.');
    }
    E.p.description = r.data.description; if ((r.data.points || []).length) E.p.points = r.data.points;
    edRender(); toast('Description améliorée : relis-la avant d\'enregistrer');
  },

  /* Boutique et loyer */
  saveShop: async function (el) {
    var g = function (k) { return $(k).value.trim(); };
    if (g('s-boutique').length < 2 || !g('s-prenom') || !g('s-nom')) return toast('Le nom de la boutique, ton prénom et ton nom sont obligatoires');
    busy(el, true);
    var r = await sb.from('mk_vendors').update({ boutique: g('s-boutique'), bio: g('s-bio'), tel: g('s-tel'), whatsapp: g('s-wa'), prenom: g('s-prenom'), nom: g('s-nom'), postnom: g('s-postnom'),
      mm_nom: g('s-mmnom'), mpesa: g('s-mpesa'), airtel: g('s-airtel'), orange: g('s-orange') }).eq('id', S.user.id);
    busy(el, false);
    if (r.error) return toast(errMsg(r.error));
    await loadMe(); renderDash(true); toast('Boutique enregistrée');
  },
  paySub: async function (el) {
    var f = $('l-cap').files[0], ref = $('l-ref').value.trim();
    if (!f && !ref) return toast('Ajoute la capture ou la référence de ton paiement');
    busy(el, true);
    try {
      var path = null;
      if (f) { var b = await toJpeg(f, 1400, 1400, false); path = 's/' + S.user.id + '/' + rnd() + '.jpg'; var u = await sb.storage.from('mk-captures').upload(path, b, { contentType: 'image/jpeg' }); if (u.error) throw u.error; }
      var r = await sb.rpc('mk_sub_create', { p_op: $('l-op').value, p_ref: ref, p_path: path }); if (r.error) throw r.error;
      await loadDash(); renderDash(); toast('Paiement envoyé à l\'administrateur');
    } catch (e) { busy(el, false); toast(errMsg(e)); }
  },

  /* Administration */
  admVendor: async function (el) {
    var act = el.dataset.do;
    if (act === 'suspendre' && armed !== 'sus' + el.dataset.id) { armed = 'sus' + el.dataset.id; el.textContent = 'Confirmer la suspension'; return; }
    busy(el, true); var r = await sb.rpc('mk_admin_vendor', { p_id: el.dataset.id, p_action: act });
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    toast('C\'est fait'); await loadAdmin(); renderAdmin();
  },
  admSub: async function (el) {
    busy(el, true); var r = await sb.rpc('mk_admin_sub', { p_id: el.dataset.id, p_ok: el.dataset.ok === '1' });
    if (r.error) { busy(el, false); return toast(errMsg(r.error)); }
    toast(el.dataset.ok === '1' ? 'Loyer confirmé : 30 jours ajoutés' : 'Paiement refusé'); await loadAdmin(); renderAdmin();
  },
  admSettings: async function (el) {
    var g = function (k) { return $(k).value.trim(); }, loyer = Number(g('g-loyer'));
    if (!(loyer >= 0)) return toast('Loyer invalide');
    busy(el, true);
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
        (fs.length ? '<div class="g8 stag">' + fs.map(function (f) { var u = safeUrl(f.url); return u ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + esc(u) + '"' + (f.kind === 'fichier' ? ' download' : '') + '>' + ico('i-file') + esc(f.nom) + '</a>' : ''; }).join('') + '</div>'
          : '<div class="banner">Le vendeur n\'a pas encore ajouté de fichier à ce produit. Contacte-le pour recevoir ta commande.</div>') +
        '<p class="note center">Garde le lien de cette page : il te redonne accès à tes fichiers.</p>';
    } else if (o.statut === 'refuse') {
      body = '<div class="banner bad"><b>Paiement non confirmé</b>Le vendeur n\'a pas pu confirmer ton paiement. Contacte-le pour régler le problème.</div><div class="recap"><span>' + esc(o.titre) + '</span><b>' + money(o.montant, o.devise) + '</b></div>';
    } else if (!o.capture) {
      body = '<div><h1 style="font-size:24px">Termine ton paiement</h1><p class="lead" style="margin-top:8px">Paie, puis envoie ta capture.</p></div>' + payInfo(o);
    } else {
      body = '<div class="wait"></div><div class="center"><h1 style="font-size:24px">Capture bien reçue</h1><p class="lead" style="margin-top:8px">Le vendeur vérifie ton paiement. Cette page se met à jour toute seule : tes fichiers apparaîtront ici.</p></div>' +
        '<div class="recap"><span>' + esc(o.titre) + '</span><b class="gt">' + money(o.montant, o.devise) + '</b></div>';
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
async function loadSettings() { var r = await sb.from('mk_settings').select('*').eq('id', 1).maybeSingle(); S.settings = r.data || { loyer: 10 }; }
async function loadDash() {
  var uid = S.user.id, rs = await Promise.all([
    sb.from('mk_orders').select('*').eq('vendor_id', uid).order('created_at', { ascending: false }).limit(200),
    sb.from('mk_products').select('*').eq('vendor_id', uid).order('created_at', { ascending: false }),
    sb.from('mk_subs').select('*').eq('vendor_id', uid).order('created_at', { ascending: false }).limit(12),
    loadSettings(), loadMe()]);
  S.orders = rs[0].data || []; S.products = rs[1].data || []; S.subs = rs[2].data || [];
}
function renderAuth() {
  var reg = S.ctx.auth !== 'login', need = !S.user;
  page('<div style="padding-top:8px"><div class="kicker">Espace vendeur</div><h1>' + (reg ? 'Crée ta boutique' : 'Connexion') + '</h1><p class="lead" style="margin-top:8px">' + (reg ? 'Loyer : ' + money((S.settings || {}).loyer || 10, 'USD') + ' par mois, payé par Mobile Money.' : 'Entre dans ton espace vendeur.') + '</p></div>' +
    (need ? '<div class="pills" style="margin-top:24px"><button class="pill' + (reg ? ' on' : '') + '" type="button" data-act="authMode" data-id="register">Créer un compte</button><button class="pill' + (reg ? '' : ' on') + '" type="button" data-act="authMode" data-id="login">J\'ai déjà un compte</button></div>' : '') +
    '<div class="box" style="margin-top:16px">' +
    (reg ? '<label>Prénom<input id="a-prenom" autocomplete="given-name"></label><div class="two"><label>Nom<input id="a-nom" autocomplete="family-name"></label><label>Postnom<input id="a-postnom"></label></div><label>Nom de ta boutique<input id="a-boutique" placeholder="Ex. Grâce Créations"></label>' : '') +
    (need || !reg ? '<label>Numéro de téléphone<input id="a-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex. 0812 345 678"></label><label>Mot de passe<input id="a-pw" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" placeholder="6 caractères minimum"></label>' : '<input id="a-tel" type="hidden" value="">') +
    '<div class="msg-err hide" id="a-err"></div>' +
    '<button class="btn btn-primary" type="button" data-act="' + (reg ? 'register' : 'login') + '"><span>' + (reg ? 'Créer ma boutique' : 'Me connecter') + '</span></button>' +
    (reg ? '<p class="note center">Ton numéro sert d\'identifiant. Note bien ton mot de passe.</p>' : '') + '</div>');
  setBar(null);
}
function shopStatus(v) {
  var loyer = money((S.settings || {}).loyer || 10, 'USD');
  if (v.suspendu) return ['bad', 'Boutique suspendue', 'L\'administrateur a suspendu ta boutique. Contacte-le.'];
  var todo = [];
  if (v.mm_statut === 'vide') todo.push('ajoute tes numéros Mobile Money (onglet Boutique)');
  else if (v.mm_statut === 'attente') todo.push('tes numéros Mobile Money attendent la confirmation de l\'administrateur');
  else if (v.mm_statut === 'refuse') todo.push('tes numéros Mobile Money ont été refusés : corrige-les (onglet Boutique)');
  var ok = v.abo_fin && new Date(v.abo_fin + 'T23:59:59') >= new Date();
  if (!v.is_admin && !ok) todo.push('paie ton loyer de ' + loyer + ' (onglet Loyer)');
  if (todo.length) return ['', 'Boutique pas encore en ligne', 'Il reste à faire : ' + todo.join(' ; ') + '.'];
  return ['ok', 'Boutique en ligne', v.is_admin ? 'Compte administrateur : pas de loyer.' : 'Loyer payé jusqu\'au ' + fmtDate(v.abo_fin) + '.'];
}
async function pageAccount(alive) {
  skeleton(); await loadMe(); if (!alive()) return; header();
  if (!S.user || !S.vendor) { if (!S.settings) { var h = await sb.rpc('mk_home'); S.settings = { loyer: (h.data || {}).loyer || 10 }; if (!alive()) return; } if (S.user && !S.vendor) S.ctx.auth = 'register'; return renderAuth(); }
  await loadDash(); if (!alive()) return; renderDash();
}
function renderDash(keepScroll) {
  var v = S.vendor, st = shopStatus(v), y = window.scrollY;
  var pend = S.orders.filter(function (o) { return o.statut === 'attente'; }).length;
  var tabs = [['commandes', 'Commandes' + (pend ? ' · ' + pend : '')], ['produits', 'Produits'], ['boutique', 'Boutique'], ['loyer', 'Loyer']];
  var body = { commandes: dashOrders, produits: dashProducts, boutique: dashShop, loyer: dashRent }[S.tab]();
  page('<div class="rowx" style="padding-top:8px">' + avatar(v) + '<div class="grow"><h1 style="font-size:24px">' + esc(v.boutique) + '</h1><p class="note">' + esc(v.prenom + ' ' + v.nom) + '</p></div></div>' +
    '<div class="banner ' + st[0] + '"><b>' + st[1] + '</b>' + esc(st[2]) + '</div>' +
    '<div class="two" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="?b=' + esc(v.slug) + '" data-nav>Voir ma boutique</a><button class="btn btn-ghost btn-sm" type="button" data-act="copy" data-text="' + esc(link('?b=' + v.slug)) + '">' + ico('i-share') + 'Copier mon lien</button></div>' +
    (v.is_admin ? '<a class="btn btn-ghost btn-sm" style="margin-top:8px" href="?v=admin" data-nav>Espace administrateur ' + ico('i-arrow') + '</a>' : '') +
    '<div class="pills" style="margin-top:24px">' + tabs.map(function (t) { return '<button class="pill' + (t[0] === S.tab ? ' on' : '') + '" type="button" data-act="tab" data-id="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div style="margin-top:16px">' + body + '</div>' +
    '<button class="btn btn-ghost btn-sm" style="margin-top:40px" type="button" data-act="logout">Me déconnecter</button>');
  setBar(null); if (keepScroll) window.scrollTo(0, y);
}
function dashOrders() {
  var done = S.orders.filter(function (o) { return o.statut === 'paye'; }), usd = 0, cdf = 0;
  done.forEach(function (o) { if (o.devise === 'CDF') cdf += Number(o.montant); else usd += Number(o.montant); });
  var h = '<div class="stats" style="margin:0 0 16px"><div class="stat"><b class="gt">' + done.length + '</b><span>ventes réussies</span></div><div class="stat"><b>' + money(usd, 'USD') + '</b><span>' + (cdf ? '+ ' + money(cdf, 'CDF') : 'encaissés') + '</span></div><div class="stat"><b>' + S.orders.filter(function (o) { return o.statut === 'attente'; }).length + '</b><span>à vérifier</span></div></div>';
  if (!S.orders.length) return h + '<div class="empty">Aucune commande pour l\'instant. Partage le lien de tes produits pour recevoir tes premiers clients.</div>';
  var st = { attente: ['a', 'À vérifier'], paye: ['g', 'Vente réussie'], refuse: ['r', 'Refusée'] };
  return h + '<div class="g12 stag">' + S.orders.map(function (o) {
    var s = st[o.statut] || st.attente, acts = '';
    if (o.capture_path) acts += '<button class="btn btn-ghost btn-sm" type="button" data-act="viewCapture" data-path="' + esc(o.capture_path) + '">Voir la capture</button>';
    else if (o.statut === 'attente') acts += '<p class="note">Le client n\'a pas encore envoyé sa capture.</p>';
    if (o.statut !== 'paye') acts += '<button class="btn btn-primary btn-sm" type="button" data-act="orderOk" data-id="' + o.id + '"><span>Argent reçu</span></button>';
    if (o.statut === 'attente') acts += '<button class="btn btn-ghost btn-sm" type="button" data-act="orderNo" data-id="' + o.id + '">Refuser</button>';
    if (o.statut === 'paye') acts += '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + waNum(o.tel) + '?text=' + encodeURIComponent('Bonjour ' + o.nom.split(' ')[0] + ', ton paiement est confirmé. Voici l\'accès à « ' + o.titre + ' » : ' + link('?c=' + o.token)) + '">Envoyer l\'accès sur WhatsApp</a>';
    return '<div class="ord"><div class="top"><div><b>' + esc(o.nom) + '</b><small>' + esc(o.tel) + ' · ' + (OPS[o.op] || '') + '</small><small>' + esc(o.titre) + ' · ' + money(o.montant, o.devise) + '</small></div><span class="tag ' + s[0] + '">' + s[1] + '</span></div>' + acts + '</div>';
  }).join('') + '</div>';
}
function dashProducts() {
  return '<button class="btn btn-primary" type="button" data-act="newProduct">' + ico('i-plus') + 'Nouveau produit</button><div class="g12 stag" style="margin-top:16px">' +
    (S.products.length ? S.products.map(function (p) {
      return '<button class="ord" type="button" data-act="editProduct" data-id="' + p.id + '" style="text-align:left;color:inherit;font:inherit;cursor:pointer"><div class="prow"><div class="sq">' + pic(p.image_url) + '</div><div><b>' + esc(p.titre) + '</b><small>' + money(p.prix, p.devise) + ' · ' + p.ventes + ' vente' + (p.ventes > 1 ? 's' : '') + '</small>' +
        '<span class="tag ' + (p.bloque ? 'r' : p.actif ? 'g' : 'a') + '" style="margin-top:8px">' + (p.bloque ? 'Bloqué' : p.actif ? 'Publié' : 'Masqué') + '</span></div></div></button>';
    }).join('') : '<div class="empty">Tu n\'as pas encore de produit. Ajoute le premier.</div>') + '</div>';
}
function upBox(key, url, label, cls) {
  return '<label class="up"><div class="' + cls + '" style="box-shadow:none">' + pic(url, label) + '</div><span class="lab">' + (safeUrl(url) ? 'Changer' : 'Ajouter') + '</span><input type="file" accept="image/*" data-up="' + key + '"></label>';
}
function dashShop() {
  var v = S.vendor, mm = { vide: ['a', 'À remplir'], attente: ['a', 'En attente de confirmation'], confirme: ['g', 'Confirmés'], refuse: ['r', 'Refusés'] }[v.mm_statut];
  return '<div class="g12"><div class="box"><h3>Photos</h3><p class="note">Photo de couverture en paysage (1920 × 1080) et photo de profil carrée.</p>' + upBox('cover', v.cover_url, 'Photo de couverture', 'cover') +
    '<div style="width:120px">' + upBox('avatar', v.avatar_url, 'Photo de profil', 'sq') + '</div></div>' +
    '<div class="box"><h3>Ma boutique</h3><label>Nom de la boutique<input id="s-boutique" value="' + esc(v.boutique) + '"></label><label>Présentation<textarea id="s-bio" placeholder="Ce que tu vends, en quelques mots">' + esc(v.bio) + '</textarea></label>' +
    '<label>Numéro WhatsApp pour les questions des clients<input id="s-wa" type="tel" value="' + esc(v.whatsapp) + '"></label><label>Numéro de téléphone affiché<input id="s-tel" type="tel" value="' + esc(v.tel) + '"></label></div>' +
    '<div class="box"><h3>Mon identité</h3><label>Prénom<input id="s-prenom" value="' + esc(v.prenom) + '"></label><div class="two"><label>Nom<input id="s-nom" value="' + esc(v.nom) + '"></label><label>Postnom<input id="s-postnom" value="' + esc(v.postnom) + '"></label></div></div>' +
    '<div class="box"><div class="rowx" style="justify-content:space-between"><h3>Mes Mobile Money</h3><span class="tag ' + mm[0] + '">' + mm[1] + '</span></div><p class="note">Tes clients paient sur ces numéros. L\'administrateur les confirme avant la mise en ligne, et après chaque modification.</p>' +
    '<label>Nom du compte<input id="s-mmnom" value="' + esc(v.mm_nom) + '"></label><label>Numéro M-Pesa<input id="s-mpesa" type="tel" value="' + esc(v.mpesa) + '"></label><label>Numéro Airtel Money<input id="s-airtel" type="tel" value="' + esc(v.airtel) + '"></label><label>Numéro Orange Money<input id="s-orange" type="tel" value="' + esc(v.orange) + '"></label></div>' +
    '<button class="btn btn-primary" type="button" data-act="saveShop"><span>Enregistrer</span></button></div>';
}
function dashRent() {
  var v = S.vendor, g = S.settings || {}, pend = S.subs.filter(function (s) { return s.statut === 'attente'; })[0];
  if (v.is_admin) return '<div class="banner ok"><b>Compte administrateur</b>Tu ne paies pas de loyer. Les loyers des vendeurs se confirment dans l\'espace administrateur.</div>';
  var ops = Object.keys(OPS).filter(function (k) { return g[k]; });
  var h = '<div class="box"><h3>Loyer mensuel : ' + money(g.loyer, 'USD') + '</h3><p class="note">' + (v.abo_fin ? 'Payé jusqu\'au ' + fmtDate(v.abo_fin) + '.' : 'Aucun loyer payé pour l\'instant.') + ' Chaque paiement confirmé ajoute 30 jours.</p>';
  if (pend) h += '<div class="banner"><b>Paiement en cours de vérification</b>Envoyé le ' + fmtDate(pend.created_at) + '. L\'administrateur va le confirmer.</div>';
  else if (!ops.length) h += '<div class="banner">Les numéros de paiement du loyer ne sont pas encore disponibles.</div>';
  else h += ops.map(function (k) { return '<div class="paynum"><small>' + OPS[k] + '</small><div class="n">' + esc(g[k]) + '</div>' + (g.mm_nom ? '<small>Nom du compte : ' + esc(g.mm_nom) + '</small>' : '') + '</div>'; }).join('') +
    '<label>Tu as payé avec<select id="l-op">' + ops.map(function (k) { return '<option value="' + k + '">' + OPS[k] + '</option>'; }).join('') + '</select></label>' +
    '<label>Référence de la transaction<input id="l-ref" placeholder="Code reçu par SMS"></label><label>Capture du paiement<input id="l-cap" type="file" accept="image/*"></label>' +
    '<button class="btn btn-primary" type="button" data-act="paySub"><span>Envoyer mon paiement</span></button>';
  h += '</div>';
  var hist = S.subs.filter(function (s) { return s.statut !== 'attente'; });
  if (hist.length) h += '<div class="sub">Historique</div><div class="g8">' + hist.map(function (s) { return '<div class="item"><span class="grow">' + fmtDate(s.created_at) + ' · ' + money(s.montant, 'USD') + '</span><span class="tag ' + (s.statut === 'confirme' ? 'g' : 'r') + '">' + (s.statut === 'confirme' ? 'Confirmé' : 'Refusé') + '</span></div>'; }).join('') + '</div>';
  return h;
}

/* ---------- Éditeur de produit ---------- */
function localDT(v) { if (!v) return ''; var d = new Date(v); if (isNaN(d)) return ''; return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
async function edLoadFiles() { if (!E || !E.id) return; var r = await sb.from('mk_product_files').select('*').eq('product_id', E.id).order('created_at'); E.files = r.data || []; }
async function openEditor(p) {
  armed = '';
  E = { id: p ? p.id : null, files: [], p: p ? JSON.parse(JSON.stringify(p)) : { titre: '', description: '', points: [], prix: '', devise: 'USD', promo_prix: null, promo_fin: null, promo_places: null, image_url: '', exemples: [], videos: [], actif: true } };
  edRender(); if (E.id) { await edLoadFiles(); if (E) edRender(); }
}
function edRead() {
  if (!E || !$('e-titre')) return;
  var p = E.p, num = function (k) { var v = $(k).value.trim(); return v === '' ? null : Number(v); };
  p.titre = $('e-titre').value.trim(); p.description = $('e-desc').value.trim();
  p.points = $('e-points').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12);
  p.prix = num('e-prix'); p.devise = $('e-devise').value; p.promo_prix = num('e-pprix'); p.promo_places = num('e-places');
  p.promo_fin = $('e-fin').value ? new Date($('e-fin').value).toISOString() : null; p.actif = $('e-actif').checked;
  document.querySelectorAll('[data-exleg]').forEach(function (i) { var e = p.exemples[Number(i.dataset.exleg)]; if (e) e.legende = i.value.trim(); });
}
function edRender() {
  var p = E.p, url = E.id ? link('?p=' + E.id) : '', keep = $('sheetRoot').querySelector('.sheet').scrollTop, was = $('sheetRoot').classList.contains('open') && $('e-titre');
  sheet('<div class="shead"><h2>' + (E.id ? 'Modifier le produit' : 'Nouveau produit') + '</h2><button class="x" type="button" data-act="closeSheet" aria-label="Fermer">' + ico('i-x') + '</button></div><div class="g12">' +
    (E.id ? '<div class="box"><h3>Lien à partager</h3><div class="linkbox">' + esc(url) + '</div>' + shareRow(url, p.titre) + '</div>' : '') +
    '<div class="box"><h3>Le produit</h3><label>Titre<input id="e-titre" maxlength="120" value="' + esc(p.titre) + '"></label>' +
    '<div class="two"><label>Prix<input id="e-prix" type="number" inputmode="decimal" min="0" step="any" value="' + (p.prix == null ? '' : p.prix) + '"></label><label>Devise<select id="e-devise"><option value="USD"' + (p.devise === 'USD' ? ' selected' : '') + '>Dollars ($)</option><option value="CDF"' + (p.devise === 'CDF' ? ' selected' : '') + '>Francs (FC)</option></select></label></div>' +
    '<label>Description<textarea id="e-desc" maxlength="6000" placeholder="Écris quelques mots : l\'assistant peut les arranger pour toi.">' + esc(p.description) + '</textarea></label>' +
    '<button class="btn btn-ghost btn-sm" type="button" data-act="edAI">' + ico('i-spark') + '<span>Arranger ma description avec l\'IA</span></button>' +
    '<label>Points forts (une ligne par point)<textarea id="e-points">' + esc((p.points || []).join('\n')) + '</textarea></label>' +
    '<div class="switch"><span>Visible dans ma boutique</span><input id="e-actif" type="checkbox"' + (p.actif ? ' checked' : '') + '></div></div>' +
    '<div class="box"><h3>Promotion limitée (facultatif)</h3><div class="two"><label>Prix promo<input id="e-pprix" type="number" inputmode="decimal" min="0" step="any" value="' + (p.promo_prix == null ? '' : p.promo_prix) + '"></label><label>Places<input id="e-places" type="number" inputmode="numeric" min="0" step="1" placeholder="Illimité" value="' + (p.promo_places == null ? '' : p.promo_places) + '"></label></div>' +
    '<label>Fin de la promo<input id="e-fin" type="datetime-local" value="' + localDT(p.promo_fin) + '"></label></div>' +
    '<div class="box"><h3>Photo du produit (carrée)</h3><div style="width:160px">' + upBox('pimg', p.image_url, 'Photo du produit', 'sq') + '</div></div>' +
    '<div class="box"><h3>Photos d\'exemples</h3><div class="exgrid">' + p.exemples.map(function (e, i) { return '<div><div class="sq">' + pic(e.url) + '<button class="xs" style="position:absolute;right:8px;top:8px;background:rgba(14,14,11,.85)" type="button" data-act="edRmEx" data-i="' + i + '" aria-label="Retirer">' + ico('i-x') + '</button></div><input type="text" data-exleg="' + i + '" placeholder="Légende" value="' + esc(e.legende || '') + '"></div>'; }).join('') +
    (p.exemples.length < 4 ? '<div>' + upBox('pex', '', 'Ajouter un exemple', 'sq') + '</div>' : '') + '</div></div>' +
    '<div class="box"><h3>Vidéos explicatives</h3><p class="note">Comment utiliser ou installer le produit. 3 vidéos maximum, 50 Mo par vidéo, ou un lien YouTube.</p>' +
    p.videos.map(function (v, i) { return '<div class="item">' + ico('i-play') + '<span class="grow">' + esc(v.titre || v.url) + '</span><button class="xs" type="button" data-act="edRmVid" data-i="' + i + '" aria-label="Retirer">' + ico('i-x') + '</button></div>'; }).join('') +
    (p.videos.length < 3 ? '<label>Titre de la vidéo<input id="e-vtitre" placeholder="Ex. Comment installer"></label><label class="btn btn-ghost btn-sm filebtn"><span>Envoyer une vidéo depuis mon téléphone</span><input type="file" accept="video/mp4,video/webm,video/quicktime" data-up="pvid"></label>' +
      '<label>Ou un lien YouTube<input id="e-vurl" type="url" inputmode="url" placeholder="https://…"></label><button class="btn btn-ghost btn-sm" type="button" data-act="edAddVidLink">Ajouter ce lien</button>' : '') + '</div>' +
    '<div class="box"><h3>Fichiers remis au client</h3><p class="note">PDF, archives, ou liens de téléchargement. Le client y accède dès que tu confirmes son paiement.</p>' +
    E.files.map(function (f) { return '<div class="item">' + ico('i-file') + '<span class="grow">' + esc(f.nom) + '</span><button class="xs" type="button" data-act="edRmFile" data-id="' + f.id + '" aria-label="Retirer">' + ico('i-x') + '</button></div>'; }).join('') +
    '<label class="btn btn-ghost btn-sm filebtn"><span>Envoyer un fichier (50 Mo max)</span><input type="file" data-up="pfile"></label>' +
    '<label>Ou un lien de téléchargement<input id="e-furl" type="url" inputmode="url" placeholder="https://…"></label><label>Nom affiché au client<input id="e-fnom" placeholder="Ex. Cours complet (PDF)"></label><button class="btn btn-ghost btn-sm" type="button" data-act="edAddLink"><span>Ajouter ce lien</span></button></div>' +
    '<button class="btn btn-primary" type="button" data-act="edSave"><span>Enregistrer le produit</span></button>' +
    (E.id ? '<button class="btn btn-danger btn-sm" type="button" data-act="edDelete">Supprimer ce produit</button>' : '') + '</div>');
  if (was) $('sheetRoot').querySelector('.sheet').scrollTop = keep;
}
async function edSave() {
  edRead(); var p = E.p;
  if (p.titre.length < 2) throw new Error('Donne un titre à ton produit.');
  if (!(p.prix > 0)) throw new Error('Indique le prix du produit.');
  if (p.promo_prix != null && !(p.promo_prix > 0 && p.promo_prix < p.prix)) throw new Error('Le prix promo doit être inférieur au prix normal.');
  var row = { titre: p.titre, description: p.description, points: p.points, prix: p.prix, devise: p.devise, promo_prix: p.promo_prix, promo_fin: p.promo_fin, promo_places: p.promo_places, image_url: p.image_url || '', exemples: p.exemples, videos: p.videos, actif: p.actif };
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
      toast('Envoi de la photo…');
      var url = k === 'cover' ? await upImage(f, 1280, 720, true) : await upImage(f, 480, 480, true), patch = {}; patch[k + '_url'] = url;
      var r = await sb.from('mk_vendors').update(patch).eq('id', S.user.id); if (r.error) throw r.error;
      S.vendor[k + '_url'] = url; renderDash(true); toast('Photo enregistrée');
    } else if (k === 'pimg') { edRead(); toast('Envoi de la photo…'); E.p.image_url = await upImage(f, 800, 800, true); edRender(); toast('Photo ajoutée : pense à enregistrer'); }
    else if (k === 'pex') { edRead(); toast('Envoi de la photo…'); E.p.exemples.push({ url: await upImage(f, 800, 800, true), legende: '' }); edRender(); toast('Exemple ajouté : pense à enregistrer'); }
    else if (k === 'pvid') {
      if (f.size > 50 * 1024 * 1024) return toast('Vidéo trop lourde : 50 Mo maximum');
      edRead(); var t = $('e-vtitre').value.trim(); toast('Envoi de la vidéo… garde cette page ouverte');
      var ext = (/\.(mp4|webm|mov)$/i.exec(f.name) || [0, 'mp4'])[1].toLowerCase();
      var vu = await upload('mk-media', S.user.id + '/' + rnd() + '.' + ext, f, f.type || 'video/mp4');
      if (!E) return; E.p.videos.push({ url: vu, titre: t }); edRender(); toast('Vidéo ajoutée : pense à enregistrer');
    } else if (k === 'pfile') {
      if (f.size > 50 * 1024 * 1024) return toast('Fichier trop lourd : 50 Mo maximum');
      toast('Envoi du fichier… garde cette page ouverte');
      if (!E.id) await edSave();
      var safe = f.name.normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'fichier';
      var fu = await upload('mk-files', S.user.id + '/' + rnd() + rnd() + '/' + safe, f, f.type || 'application/octet-stream');
      var ins = await sb.from('mk_product_files').insert({ product_id: E.id, vendor_id: S.user.id, nom: f.name.slice(0, 150), url: fu, kind: 'fichier' }); if (ins.error) throw ins.error;
      edRead(); await edLoadFiles(); edRender(); toast('Fichier ajouté');
    }
  } catch (err) { toast(errMsg(err)); }
});

/* ---------- Administration ---------- */
async function loadAdmin() {
  var rs = await Promise.all([sb.from('mk_vendors').select('*').order('created_at', { ascending: false }), sb.from('mk_subs').select('*').eq('statut', 'attente').order('created_at'), loadSettings()]);
  S.adm = { vendors: rs[0].data || [], subs: rs[1].data || [] };
}
async function pageAdmin(alive) {
  skeleton(); await loadMe(); if (!alive()) return;
  if (!S.vendor || !S.vendor.is_admin) return notFound('Cet espace est réservé à l\'administrateur.');
  await loadAdmin(); if (!alive()) return; renderAdmin();
}
function renderAdmin() {
  var a = S.adm, byId = {}; a.vendors.forEach(function (v) { byId[v.id] = v; });
  var mm = a.vendors.filter(function (v) { return v.mm_statut === 'attente'; });
  var tabs = [['confirmer', 'Mobile Money' + (mm.length ? ' · ' + mm.length : '')], ['loyers', 'Loyers' + (a.subs.length ? ' · ' + a.subs.length : '')], ['vendeurs', 'Vendeurs'], ['reglages', 'Réglages']], body = '';
  function who(v) { return '<b>' + esc(v.boutique) + '</b><small>' + esc([v.prenom, v.nom, v.postnom].filter(Boolean).join(' ')) + ' · ' + esc(v.tel) + '</small>'; }
  if (S.atab === 'confirmer') body = mm.length ? '<div class="g12 stag">' + mm.map(function (v) {
    return '<div class="ord"><div>' + who(v) + '</div><div class="g8">' + (v.mm_nom ? '<div class="item"><span class="grow">Nom du compte : ' + esc(v.mm_nom) + '</span></div>' : '') +
      Object.keys(OPS).filter(function (k) { return v[k]; }).map(function (k) { return '<div class="item"><span class="grow">' + OPS[k] + ' : ' + esc(v[k]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="two"><button class="btn btn-primary btn-sm" type="button" data-act="admVendor" data-do="mm_ok" data-id="' + v.id + '"><span>Confirmer</span></button><button class="btn btn-ghost btn-sm" type="button" data-act="admVendor" data-do="mm_non" data-id="' + v.id + '">Refuser</button></div></div>';
  }).join('') + '</div>' : '<div class="empty">Aucun numéro Mobile Money à confirmer.</div>';
  else if (S.atab === 'loyers') body = a.subs.length ? '<div class="g12 stag">' + a.subs.map(function (s) {
    var v = byId[s.vendor_id] || { boutique: 'Vendeur', prenom: '', nom: '', tel: '' };
    return '<div class="ord"><div class="top"><div>' + who(v) + '<small>' + (OPS[s.op] || '') + (s.ref ? ' · Réf. ' + esc(s.ref) : '') + ' · ' + fmtDate(s.created_at) + '</small></div><span class="tag a">' + money(s.montant, 'USD') + '</span></div>' +
      (s.capture_path ? '<button class="btn btn-ghost btn-sm" type="button" data-act="viewCapture" data-path="' + esc(s.capture_path) + '">Voir la capture</button>' : '<p class="note">Pas de capture : vérifie avec la référence.</p>') +
      '<div class="two"><button class="btn btn-primary btn-sm" type="button" data-act="admSub" data-ok="1" data-id="' + s.id + '"><span>Loyer reçu</span></button><button class="btn btn-ghost btn-sm" type="button" data-act="admSub" data-ok="0" data-id="' + s.id + '">Refuser</button></div></div>';
  }).join('') + '</div>' : '<div class="empty">Aucun loyer à confirmer.</div>';
  else if (S.atab === 'vendeurs') body = '<div class="g12 stag">' + a.vendors.map(function (v) {
    var ok = v.abo_fin && new Date(v.abo_fin + 'T23:59:59') >= new Date();
    return '<div class="ord"><div class="top"><div>' + who(v) + '<small>' + (v.is_admin ? 'Administrateur' : ok ? 'Loyer payé jusqu\'au ' + fmtDate(v.abo_fin) : 'Loyer non payé') + ' · Mobile Money : ' + v.mm_statut + '</small></div>' + (v.suspendu ? '<span class="tag r">Suspendu</span>' : '') + '</div>' +
      '<div class="two"><a class="btn btn-ghost btn-sm" href="?b=' + esc(v.slug) + '" data-nav>Voir</a>' + (v.is_admin ? '<span></span>' : '<button class="btn ' + (v.suspendu ? 'btn-ghost' : 'btn-danger') + ' btn-sm" type="button" data-act="admVendor" data-do="' + (v.suspendu ? 'reactiver' : 'suspendre') + '" data-id="' + v.id + '">' + (v.suspendu ? 'Réactiver' : 'Suspendre') + '</button>') + '</div></div>';
  }).join('') + '</div>';
  else { var g = S.settings || {}; body = '<div class="box"><h3>Loyer et paiement des vendeurs</h3><label>Loyer mensuel ($)<input id="g-loyer" type="number" inputmode="decimal" min="0" step="any" value="' + esc(g.loyer) + '"></label><p class="note">Les vendeurs paient leur loyer sur ces numéros.</p>' +
    '<label>Nom du compte<input id="g-nom" value="' + esc(g.mm_nom) + '"></label><label>Numéro M-Pesa<input id="g-mpesa" type="tel" value="' + esc(g.mpesa) + '"></label><label>Numéro Airtel Money<input id="g-airtel" type="tel" value="' + esc(g.airtel) + '"></label><label>Numéro Orange Money<input id="g-orange" type="tel" value="' + esc(g.orange) + '"></label>' +
    '<label>Ton WhatsApp<input id="g-wa" type="tel" value="' + esc(g.whatsapp) + '"></label><button class="btn btn-primary" type="button" data-act="admSettings"><span>Enregistrer</span></button></div>'; }
  page('<a class="note rowx" style="padding-top:8px" href="?v=compte" data-nav>' + ico('i-back') + 'Ma boutique</a><h1 style="margin-top:12px">Administration</h1>' +
    '<div class="stats"><div class="stat"><b class="gt">' + a.vendors.length + '</b><span>vendeurs</span></div><div class="stat"><b>' + mm.length + '</b><span>Mobile Money à confirmer</span></div><div class="stat"><b>' + a.subs.length + '</b><span>loyers à confirmer</span></div></div>' +
    '<div class="pills" style="margin-top:24px">' + tabs.map(function (t) { return '<button class="pill' + (t[0] === S.atab ? ' on' : '') + '" type="button" data-act="atab" data-id="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div style="margin-top:16px">' + body + '</div>');
  setBar(null);
}

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
