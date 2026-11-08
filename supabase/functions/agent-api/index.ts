// API de l'onglet « Agent IA » de Tiya.
import {
  agentSystem, askAI, cors, json, knowledge, logMessage, normPhone, sendText, sha256, sql,
} from "../shared.ts";

const BASE = Deno.env.get("SUPABASE_URL") ?? "";

function publicSpace(s: any) {
  return {
    id: s.id,
    phone: s.phone,
    name: s.name,
    business: s.business,
    tone: s.tone,
    ai_provider: s.ai_provider,
    ai_model: s.ai_model,
    has_ai_key: !!s.ai_key,
    wa_phone_number_id: s.wa_phone_number_id,
    has_wa_token: !!s.wa_token,
    has_app_secret: !!s.wa_app_secret,
    verify_token: s.verify_token,
    agent_enabled: s.agent_enabled,
    webhook_url: `${BASE}/functions/v1/whatsapp-webhook?space=${s.id}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let b: any = {};
  try { b = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const action = String(b.action ?? "");

  try {
    // ---------------------------------------------------------- inscription : juste le numéro
    if (action === "register") {
      const phone = normPhone(String(b.phone ?? ""));
      const key = String(b.key ?? "");
      if (phone.length < 9) return json({ error: "Numéro de téléphone invalide." }, 400);
      if (key.length < 24) return json({ error: "Clé d'appareil invalide." }, 400);
      const [s] = await sql`
        insert into agent.spaces (owner_key_hash, phone, name, business)
        values (${await sha256(key)}, ${phone}, ${String(b.name || "Mon activité").slice(0, 80)}, ${String(b.business ?? "").slice(0, 2000)})
        returning *`;
      return json({ space: publicSpace(s) });
    }

    // ---------------------------------------------------------- authentification de l'appareil
    const spaceId = req.headers.get("x-tiya-space") ?? "";
    const key = req.headers.get("x-tiya-key") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(spaceId) || !key) return json({ error: "Non autorisé" }, 401);
    const [space] = await sql`select * from agent.spaces where id = ${spaceId}`;
    if (!space || space.owner_key_hash !== (await sha256(key))) return json({ error: "Non autorisé" }, 401);
    const sid = space.id;

    switch (action) {
      // ------------------------------------------------------ espace
      case "space_get": {
        const [st] = await sql`
          select (select count(*) from agent.clients where space_id = ${sid})::int as clients,
                 (select count(*) from agent.kb where space_id = ${sid})::int as kb,
                 (select count(*) from agent.conversations where space_id = ${sid})::int as conversations,
                 (select coalesce(sum(unread),0) from agent.conversations where space_id = ${sid})::int as unread,
                 (select count(*) from agent.conversations where space_id = ${sid} and mode = 'human')::int as waiting_human`;
        return json({ space: publicSpace(space), stats: st });
      }
      case "space_update": {
        const f = (k: string, max = 4000) => (b[k] === undefined ? space[k] : String(b[k]).slice(0, max));
        const secret = (k: string) => (b[k] ? String(b[k]).trim() : space[k]); // vide = inchangé
        const [s] = await sql`
          update agent.spaces set
            name = ${f("name", 80)}, business = ${f("business")}, tone = ${f("tone", 200)},
            phone = ${b.phone ? normPhone(String(b.phone)) : space.phone},
            ai_provider = ${f("ai_provider", 20)}, ai_model = ${f("ai_model", 80)}, ai_key = ${secret("ai_key")},
            wa_phone_number_id = ${f("wa_phone_number_id", 40).trim()}, wa_token = ${secret("wa_token")},
            wa_app_secret = ${secret("wa_app_secret")},
            agent_enabled = ${b.agent_enabled === undefined ? space.agent_enabled : !!b.agent_enabled}
          where id = ${sid} returning *`;
        return json({ space: publicSpace(s) });
      }
      case "wa_test": {
        if (!space.wa_phone_number_id || !space.wa_token) return json({ ok: false, message: "Renseigne l'identifiant du numéro et le jeton." });
        const r = await fetch(
          `https://graph.facebook.com/v23.0/${space.wa_phone_number_id}?fields=display_phone_number,verified_name`,
          { headers: { Authorization: `Bearer ${space.wa_token}` } },
        );
        const j = await r.json().catch(() => ({}));
        return r.ok
          ? json({ ok: true, message: `Connecté : ${j.verified_name ?? ""} (${j.display_phone_number ?? ""})` })
          : json({ ok: false, message: j?.error?.message ?? `Erreur ${r.status}` });
      }
      case "ask_test": {
        const kb = await knowledge(sid);
        const reply = await askAI(space, agentSystem(space, kb),
          `Nom du client : Test\n\nConversation :\nClient : ${String(b.question ?? "")}\n\nÉcris uniquement ta prochaine réponse au client.`);
        const human = reply.includes("[HUMAIN]");
        return json({ reply: reply.replaceAll("[HUMAIN]", "").trim(), handoff: human });
      }

      // ------------------------------------------------------ base de connaissances
      case "kb_list":
        return json({ items: await sql`select * from agent.kb where space_id = ${sid} order by title` });
      case "kb_save": {
        const title = String(b.title ?? "").slice(0, 200), content = String(b.content ?? "").slice(0, 20000);
        const [r] = b.id
          ? await sql`update agent.kb set title = ${title}, content = ${content}, updated_at = now()
                      where id = ${b.id} and space_id = ${sid} returning *`
          : await sql`insert into agent.kb (space_id, title, content) values (${sid}, ${title}, ${content}) returning *`;
        return json({ item: r });
      }
      case "kb_delete":
        await sql`delete from agent.kb where id = ${b.id} and space_id = ${sid}`;
        return json({ ok: true });

      // ------------------------------------------------------ clients
      case "clients_list":
        return json({ items: await sql`select * from agent.clients where space_id = ${sid} order by name` });
      case "clients_save": {
        const phone = normPhone(String(b.phone ?? ""));
        if (phone.length < 9) return json({ error: "Numéro invalide." }, 400);
        const [r] = b.id
          ? await sql`update agent.clients set name = ${String(b.name ?? "")}, phone = ${phone}, notes = ${String(b.notes ?? "")},
                      opted_in = ${b.opted_in !== false} where id = ${b.id} and space_id = ${sid} returning *`
          : await sql`insert into agent.clients (space_id, name, phone, notes) values (${sid}, ${String(b.name ?? "")}, ${phone}, ${String(b.notes ?? "")})
                      on conflict (space_id, phone) do update set name = excluded.name, notes = excluded.notes returning *`;
        return json({ item: r });
      }
      case "clients_import": {
        let n = 0;
        for (const c of (b.items ?? []).slice(0, 2000)) {
          const phone = normPhone(String(c.phone ?? ""));
          if (phone.length < 9) continue;
          await sql`insert into agent.clients (space_id, name, phone, notes)
                    values (${sid}, ${String(c.name ?? "")}, ${phone}, ${String(c.notes ?? "")})
                    on conflict (space_id, phone) do update set name = excluded.name`;
          n++;
        }
        return json({ imported: n });
      }
      case "clients_delete":
        await sql`delete from agent.clients where id = ${b.id} and space_id = ${sid}`;
        return json({ ok: true });

      // ------------------------------------------------------ campagnes
      case "campaign_list":
        return json({ items: await sql`select * from agent.campaigns where space_id = ${sid} order by created_at desc limit 50` });
      case "campaign_create": {
        const delay = Math.max(20, Number(b.delay_seconds ?? 20) || 20);
        const goal = String(b.goal ?? "").trim();
        if (!goal) return json({ error: "Décris l'objectif de la campagne." }, 400);
        const ids: string[] = Array.isArray(b.client_ids) ? b.client_ids : [];
        const clients = ids.length
          ? await sql`select * from agent.clients where space_id = ${sid} and opted_in and id in ${sql(ids)} order by name`
          : await sql`select * from agent.clients where space_id = ${sid} and opted_in order by name`;
        if (!clients.length) return json({ error: "Aucun client sélectionné." }, 400);
        const [c] = await sql`
          insert into agent.campaigns (space_id, title, goal, template_name, template_lang, delay_seconds, total)
          values (${sid}, ${String(b.title || goal.slice(0, 40))}, ${goal}, ${String(b.template_name ?? "").trim()},
                  ${String(b.template_lang || "fr")}, ${delay}, ${clients.length})
          returning *`;
        const start = Date.now() + 5000;
        const rows = clients.map((cl: any, i: number) => ({
          campaign_id: c.id, space_id: sid, client_name: cl.name, phone: cl.phone, notes: cl.notes,
          send_at: new Date(start + i * delay * 1000),
        }));
        await sql`insert into agent.campaign_items ${sql(rows, "campaign_id", "space_id", "client_name", "phone", "notes", "send_at")}`;
        return json({ item: c });
      }
      case "campaign_cancel":
        await sql`update agent.campaigns set status = 'cancelled' where id = ${b.id} and space_id = ${sid}`;
        await sql`update agent.campaign_items set status = 'skipped' where campaign_id = ${b.id} and status = 'pending'`;
        return json({ ok: true });
      case "campaign_items":
        return json({ items: await sql`select client_name, phone, send_at, status, text, error from agent.campaign_items
                                       where campaign_id = ${b.id} and space_id = ${sid} order by send_at` });

      // ------------------------------------------------------ conversations
      case "conv_list":
        return json({ items: await sql`select * from agent.conversations where space_id = ${sid} order by last_message_at desc limit 200` });
      case "conv_messages": {
        const [conv] = await sql`select * from agent.conversations where id = ${b.id} and space_id = ${sid}`;
        if (!conv) return json({ error: "Conversation introuvable" }, 404);
        await sql`update agent.conversations set unread = 0 where id = ${conv.id}`;
        const msgs = await sql`select * from agent.messages where conversation_id = ${conv.id} order by created_at desc limit 200`;
        return json({ conversation: conv, items: msgs.reverse() });
      }
      case "conv_send": {
        const [conv] = await sql`select * from agent.conversations where id = ${b.id} and space_id = ${sid}`;
        if (!conv) return json({ error: "Conversation introuvable" }, 404);
        const text = String(b.text ?? "").trim();
        if (!text) return json({ error: "Message vide" }, 400);
        const r = await sendText(space, conv.client_phone, text);
        await logMessage(conv.id, "out", "human", text, r.id, r.ok ? "ok" : `erreur: ${r.error}`);
        return json({ ok: r.ok, error: r.error });
      }
      case "conv_mode":
        await sql`update agent.conversations set mode = ${b.mode === "human" ? "human" : "ai"} where id = ${b.id} and space_id = ${sid}`;
        return json({ ok: true });
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    console.error(action, e);
    return json({ error: String((e as Error)?.message ?? e).slice(0, 400) }, 500);
  }
});
