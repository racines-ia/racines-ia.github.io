// Fabrique une petite page par produit (cuervo/p/<id>/index.html) pour que WhatsApp et Facebook
// affichent la photo et le titre du produit. Lancé toutes les 10 minutes par GitHub Actions.
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
const URL_ = 'https://eebqtggnmuzfrwgunpsa.supabase.co', KEY = 'sb_publishable_lOSLDkJ_SGGKmW5dnLQTig_i8Wa-Vp0';
const SITE = 'https://racines-ia.github.io/cuervo/';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, d) => Number(n).toLocaleString('fr-FR') + (d === 'CDF' ? ' FC' : ' $');
let products;
if (process.argv[2]) products = JSON.parse(readFileSync(process.argv[2], 'utf8'));
else {
  // Liste réservée aux pages de partage (il n'y a plus de catalogue public sur le site)
  const r = await fetch(URL_ + '/rest/v1/rpc/mk_share_list', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  products = await r.json();
  if (!Array.isArray(products)) throw new Error('Réponse inattendue');
}
// Sécurité : ne jamais tout effacer si la liste revient vide par erreur
if (!products.length) { console.log('Aucun produit reçu : pages existantes conservées.'); process.exit(0); }
rmSync('cuervo/p', { recursive: true, force: true }); rmSync('cuervo/l', { recursive: true, force: true });
for (const p of products) {
  if (!/^[0-9a-f-]{36}$/i.test(p.id)) continue;
  const img = /^https:\/\//.test(p.cover_url || '') ? p.cover_url : /^https:\/\//.test(p.image_url || '') ? p.image_url : '';
  const desc = money(p.prix_actuel, p.devise) + (p.promo ? ' au lieu de ' + money(p.prix, p.devise) : '') + ' · Boutique ' + (p.boutique || '') + ' sur cuervo.co';
  for (const [dir, q, tt] of [['p', '?p=', p.titre], ['l', '?l=', p.titre]]) {
  const to = SITE + q + p.id;
  mkdirSync('cuervo/' + dir + '/' + p.id, { recursive: true });
  writeFileSync('cuervo/' + dir + '/' + p.id + '/index.html', `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.titre)} — cuervo.co</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="cuervo.co">
<meta property="og:title" content="${esc(p.titre)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${dir}/${p.id}/">${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<script>location.replace(${JSON.stringify(to)}+(location.search?"&"+location.search.slice(1):""))</script></head>
<body style="background:#07100B;color:#F1F5EE;font-family:sans-serif;padding:24px"><a style="color:#9BE36A" href="${esc(to)}">Ouvrir ${esc(p.titre)}</a></body></html>
`);
  }
}
console.log(products.length + ' produit(s) : pages de partage et landing pages');
