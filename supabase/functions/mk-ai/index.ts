import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Modèles rapides d'abord ; GEMINI_MODEL_RAPIDE permet d'en imposer un autre.
const MODELS = [Deno.env.get("GEMINI_MODEL_RAPIDE"), "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest"]
  .filter(Boolean) as string[];

async function ask(key: string, model: string, prompt: string, fast: boolean) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const gc: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0.9, maxOutputTokens: 1600 };
    if (fast) gc.thinkingConfig = { thinkingBudget: 0 };
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: gc }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) return { status: r.status, text: "", err: JSON.stringify(out)?.slice(0, 300) };
    const text = (out?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    return { status: 200, text, err: "" };
  } catch (e) {
    return { status: 0, text: "", err: String(e) };
  } finally { clearTimeout(t); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "Connexion requise" }, 401);
    const { data: v } = await sb.from("mk_vendors").select("id").eq("id", u.user.id).maybeSingle();
    if (!v) return json({ error: "Compte vendeur requis" }, 403);

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "L'assistant IA n'est pas encore activé." }, 503);

    const body = await req.json().catch(() => ({}));
    const titre = String(body.titre ?? "").slice(0, 200);
    const brouillon = String(body.description ?? "").slice(0, 4000);
    const points = Array.isArray(body.points) ? body.points.map((p: unknown) => String(p)).slice(0, 12).join(" ; ") : "";
    if (!titre && !brouillon && !points) return json({ error: "Écris d'abord un titre ou quelques mots sur ton produit." }, 400);

    const prompt =
      "Tu aides un vendeur en République démocratique du Congo à présenter son produit sur sa boutique en ligne. " +
      "Propose 3 versions différentes de la description et des points forts, en français simple et vendeur : " +
      "1) « Courte et directe », 2) « Chaleureuse et rassurante », 3) « Axée sur les résultats ». " +
      "Tu peux reformuler et mettre en valeur ce que le vendeur a écrit, mais n'invente aucun chiffre, prix, garantie, délai ni résultat chiffré. " +
      "Réponds uniquement en JSON : {\"propositions\":[{\"style\":\"…\",\"description\":\"2 à 4 phrases\",\"points\":[\"3 à 5 points très courts\"]}]}.\n\n" +
      "Titre : " + titre + "\nDescription du vendeur : " + (brouillon || "(vide)") + "\nPoints forts du vendeur : " + (points || "(aucun)");

    let text = "";
    for (const m of MODELS) {
      let r = await ask(key, m, prompt, true);
      if (r.status === 400) r = await ask(key, m, prompt, false);
      if (r.status === 200 && r.text) { text = r.text; break; }
      console.log("gemini", m, r.status, r.err);
    }
    if (!text) return json({ error: "L'assistant IA n'a pas répondu. Réessaie dans un instant." }, 502);

    let parsed: { propositions?: unknown } = {};
    try { parsed = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()); } catch (_) { /* ignoré */ }
    const props = (Array.isArray(parsed.propositions) ? parsed.propositions : []).slice(0, 3).map((p: Record<string, unknown>) => ({
      style: String(p?.style ?? "").slice(0, 60),
      description: String(p?.description ?? "").trim().slice(0, 3000),
      points: Array.isArray(p?.points) ? (p.points as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [],
    })).filter((p: { description: string }) => p.description);
    if (!props.length) return json({ error: "L'assistant IA n'a rien proposé. Réessaie." }, 502);
    return json({ propositions: props });
  } catch (e) {
    console.error(e);
    return json({ error: "Erreur de l'assistant IA." }, 500);
  }
});
