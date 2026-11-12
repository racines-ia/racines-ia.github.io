import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// mk-r2-sign : donne au vendeur connecté une adresse d'envoi temporaire (10 min) vers Cloudflare R2.
// Les clés R2 restent dans les secrets Supabase (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
const ACCOUNT = Deno.env.get("R2_ACCOUNT_ID") ?? "4e8c720683fd450c14edd88446ed7562";
const BUCKET = Deno.env.get("R2_BUCKET") ?? "cuervo-media";
const PUBLIC = (Deno.env.get("R2_PUBLIC_URL") ?? "https://pub-91391feafa68488487ed1141331cb873.r2.dev").replace(/\/$/, "");
const MAX = 200 * 1024 * 1024;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(key: ArrayBuffer | Uint8Array, s: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, enc.encode(s));
}
const uri = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function presign(key: string, id: string, secret: string) {
  const host = `${ACCOUNT}.r2.cloudflarestorage.com`;
  const now = new Date(), amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), day = amz.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const path = "/" + BUCKET + "/" + key.split("/").map(uri).join("/");
  const q: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${id}/${scope}`, "X-Amz-Date": amz,
    "X-Amz-Expires": "600", "X-Amz-SignedHeaders": "host",
  };
  const qs = Object.keys(q).sort().map((k) => `${uri(k)}=${uri(q[k])}`).join("&");
  const canon = ["PUT", path, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", amz, scope, await sha(canon)].join("\n");
  let k: ArrayBuffer = await hmac(enc.encode("AWS4" + secret), day);
  for (const p of ["auto", "s3", "aws4_request"]) k = await hmac(k, p);
  const sig = hex(await hmac(k, sts));
  return `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const id = Deno.env.get("R2_ACCESS_KEY_ID"), secret = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!id || !secret) return json({ error: "R2 pas encore configuré", off: true }, 503);
  // Qui envoie ? (le jeton du vendeur connecté)
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const u = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, Authorization: req.headers.get("Authorization") ?? "" } });
  const user = u.ok ? await u.json() : null;
  if (!user?.id) return json({ error: "Connecte-toi pour envoyer un fichier." }, 401);
  const b = await req.json().catch(() => ({}));
  const type = String(b.type ?? ""), size = Number(b.size ?? 0);
  if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(type)) return json({ error: "Type de fichier non accepté." }, 400);
  if (!(size > 0) || size > MAX) return json({ error: "Fichier trop lourd (200 Mo au plus)." }, 400);
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" } as Record<string, string>)[type];
  const key = `${user.id}/${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}.${ext}`;
  return json({ upload_url: await presign(key, id, secret), public_url: `${PUBLIC}/${key}` });
});
