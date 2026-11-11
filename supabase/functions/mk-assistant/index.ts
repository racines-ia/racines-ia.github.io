import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Cuervo IA : guide les visiteurs de cuervo.co (produits, prix, achat, boutiques, loyer).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELS = [Deno.env.get("GEMINI_MODEL_RAPIDE"), "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest"].filter(Boolean) as string[];
const hits = new Map<string, number[]>();

function money(n: number, d: string) { return Number(n).toLocaleString("fr-FR") + (d === "CDF" ? " FC" : " $"); }

async function ask(key: string, model: string, system: string, contents: unknown[], fast: boolean) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const gc: Record<string, unknown> = { temperature: 0.6, maxOutputTokens: 900, responseMimeType: "application/json" };
    if (fast) gc.thinkingConfig = { thinkingBudget: 0 };
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: gc }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) return { status: r.status, text: "" };
    return { status: 200, text: (out?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("") };
  } catch (_) { return { status: 0, text: "" }; } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  // Limite simple : 20 questions par 10 minutes et par adresse
  const ip = (req.headers.get("x-forwarded-for") ?? "?").split(",")[0].trim(), now = Date.now();
  const h = (hits.get(ip) ?? []).filter((t) => now - t < 600000);
  if (h.length >= 20) return json({ error: "Tu as posé beaucoup de questions. Réessaie dans quelques minutes." }, 429);
  h.push(now); hits.set(ip, h);

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "Cuervo IA n'est pas encore activé." }, 503);
  const body = await req.json().catch(() => ({}));
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-10)
    .map((m: { role?: string; text?: string }) => ({ role: m.role === "ia" ? "model" : "user", parts: [{ text: String(m.text ?? "").slice(0, 600) }] }))
    .filter((m: { parts: { text: string }[] }) => m.parts[0].text);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "Pose ta question." }, 400);

  // Catalogue public en direct
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const hr = await fetch(url + "/rest/v1/rpc/mk_home", { method: "POST", headers: { apikey: anon, Authorization: "Bearer " + anon, "Content-Type": "application/json" }, body: "{}" });
  const home = hr.ok ? await hr.json() : { products: [], loyer: 15000 };
  const ps = (home.products ?? []) as Record<string, unknown>[];
  const ids = new Set(ps.map((p) => String(p.id)));
  const catalogue = ps.slice(0, 80).map((p) =>
    `- id=${p.id} | ${p.titre} | ${money(Number(p.prix_actuel), String(p.devise))}${p.promo ? ` (promo, prix normal ${money(Number(p.prix), String(p.devise))}${p.promo_places != null ? `, ${p.promo_places} places` : ""})` : ""} | catégorie : ${p.categorie || "non précisée"} | boutique : ${p.boutique} | ${p.ventes} vente(s)`).join("\n") || "(aucun produit en ligne pour le moment)";

  const system = `Tu es « Cuervo IA », l'assistant de cuervo.co, une place de marché de produits digitaux en République démocratique du Congo (formations, fichiers, modèles, applications, designs…).
Réponds en français simple et chaleureux, en 2 à 5 phrases courtes. Tutoie le visiteur.
Tu aides à : trouver le bon produit selon le besoin et le budget, comparer les prix, repérer les promos et les produits les moins chers, comprendre comment acheter, comment ouvrir une boutique et comment fonctionne le loyer.
Tu ne parles QUE des produits du catalogue ci-dessous : n'invente jamais un produit, un prix, une note, un avis ni une qualité. Pour juger la qualité, tu peux seulement t'appuyer sur le nombre de ventes et les promos. Si rien ne correspond, dis-le honnêtement.
Règles du site :
- Acheter : ouvrir le produit, toucher « Payer », entrer son nom et son numéro WhatsApp, payer par M-Pesa, Airtel Money ou Orange Money au numéro affiché, puis envoyer la capture. Dès que le paiement est confirmé, le client accède à ses fichiers sur la page de sa commande.
- L'argent des ventes va directement sur les numéros Mobile Money du vendeur. cuervo.co ne garde aucune somme, sauf le loyer des boutiques.
- Ouvrir une boutique : toucher « Vendre », créer son compte avec son numéro, ajouter ses numéros Mobile Money (confirmés par l'administrateur) et ses produits.
- Loyer : ${money(Number(home.loyer ?? 15000), "CDF")} par mois. Le vendeur choisit : le payer tout de suite, ou le payer sur sa première vente du mois (cette vente arrive alors chez cuervo.co, qui garde le loyer et reverse le reste au vendeur).
- Pour une question sur une commande précise, conseille d'écrire au vendeur depuis la page du produit.
Catalogue actuel :
${catalogue}
Réponds uniquement en JSON : {"reponse":"ton texte","produits":["id", ...]} avec au plus 3 identifiants de produits du catalogue que tu recommandes (liste vide si aucun).`;

  let text = "";
  for (const m of MODELS) {
    let r = await ask(key, m, system, msgs, true);
    if (r.status === 400) r = await ask(key, m, system, msgs, false);
    if (r.status === 200 && r.text) { text = r.text; break; }
  }
  if (!text) return json({ error: "Cuervo IA n'a pas répondu. Réessaie dans un instant." }, 502);
  let parsed: { reponse?: unknown; produits?: unknown } = {};
  try { parsed = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()); } catch (_) { parsed = { reponse: text }; }
  const reponse = String(parsed.reponse ?? "").trim().slice(0, 2000);
  const produits = (Array.isArray(parsed.produits) ? parsed.produits : []).map(String).filter((i) => ids.has(i)).slice(0, 3);
  if (!reponse) return json({ error: "Cuervo IA n'a rien répondu. Réessaie." }, 502);
  return json({ reponse, produits });
});
