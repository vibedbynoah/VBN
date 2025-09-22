export const onRequestGet: PagesFunction = async ({ env }) => {
  try {
    // Prove the binding works
    const { results: ping } = await env.DB.prepare("SELECT 1 AS one").all();

    // List tables so we can confirm 'igcse' exists
    const { results: tables } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();

    return new Response(JSON.stringify({ ok: true, ping, tables }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
