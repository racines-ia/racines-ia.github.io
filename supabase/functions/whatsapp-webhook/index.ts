// Webhook WhatsApp (API officielle Meta) : reçoit les messages des clients et fait répondre l'Agent IA.
import {
  agentSystem, askAI, knowledge, logMessage, sendText, sql, upsertConversation,
} from "../shared.ts";

async function validSignature(req: Request, raw: string, secret: string): Promise<boolean> {
  if (!secret) return true; // vérification optionnelle (clé secrète de l'app Meta)
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sig === `sha256=${hex}`;
}

async function handleIncoming(space: any, from: string, name: string, text: string, waId: string) {
  const conv = await upsertConversation(space.id, from, name);
  const [dup] = await sql`select 1 from agent.messages where wa_id = ${waId} and direction = 'in'`;
  if (dup) return; // Meta renvoie parfois le même message
  await logMessage(conv.id, "in", "client", text, waId);
  await sql`update agent.conversations set last_inbound_at = now(), unread = unread + 1 where id = ${conv.id}`;

  if (!space.agent_enabled || conv.mode !== "ai") return;

  const history = await sql`
    select direction, author, text from agent.messages
    where conversation_id = ${conv.id} order by created_at desc limit 14`;
  const transcript = history.reverse()
    .map((m) => `${m.direction === "in" ? "Client" : "Toi"} : ${m.text}`)
    .join("\n");
  const kb = await knowledge(space.id);
  let reply: string;
  try {
    reply = await askAI(
      space,
      agentSystem(space, kb),
      `Nom du client : ${name || "inconnu"}\n\nConversation (du plus ancien au plus récent) :\n${transcript}\n\nÉcris uniquement ta prochaine réponse au client.`,
    );
  } catch (e) {
    console.error("IA", e);
    return; // pas de réponse plutôt qu'une réponse fausse ; le message reste visible dans Tiya
  }
  let handOff = false;
  if (reply.includes("[HUMAIN]")) {
    handOff = true;
    reply = reply.replaceAll("[HUMAIN]", "").trim();
  }
  if (!reply) return;
  const r = await sendText(space, from, reply);
  await logMessage(conv.id, "out", "ai", reply, r.id, r.ok ? "ok" : `erreur: ${r.error}`);
  if (handOff) await sql`update agent.conversations set mode = 'human' where id = ${conv.id}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const spaceId = url.searchParams.get("space") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(spaceId)) return new Response("espace manquant", { status: 400 });
  const [space] = await sql`select * from agent.spaces where id = ${spaceId}`;
  if (!space) return new Response("espace inconnu", { status: 404 });

  // Vérification du webhook par Meta
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === space.verify_token;
    return ok
      ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
      : new Response("jeton invalide", { status: 403 });
  }

  const raw = await req.text();
  if (!(await validSignature(req, raw, space.wa_app_secret))) return new Response("signature", { status: 401 });

  let body: any = {};
  try { body = JSON.parse(raw); } catch { return new Response("ok"); }

  const jobs: Promise<unknown>[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const names: Record<string, string> = {};
      for (const c of v.contacts ?? []) names[c.wa_id] = c.profile?.name ?? "";
      for (const m of v.messages ?? []) {
        let text = "";
        if (m.type === "text") text = m.text?.body ?? "";
        else if (m.type === "button") text = m.button?.text ?? "";
        else if (m.type === "interactive") text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        else text = `[${m.type} reçu]`;
        jobs.push(handleIncoming(space, m.from, names[m.from] ?? "", text, m.id).catch((e) => console.error(e)));
      }
      // Statuts d'envoi (livré, lu, échec)
      for (const s of v.statuses ?? []) {
        if (s.status === "failed") {
          jobs.push(sql`update agent.messages set status = ${"échec: " + (s.errors?.[0]?.title ?? "")} where wa_id = ${s.id}`);
        }
      }
    }
  }
  // Répondre vite à Meta, traiter en arrière-plan.
  // @ts-ignore EdgeRuntime existe dans Supabase
  EdgeRuntime.waitUntil(Promise.all(jobs));
  return new Response("ok");
});
