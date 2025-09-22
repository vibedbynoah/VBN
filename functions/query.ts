export async function onRequest(context) {
  const { request, env } = context;

  // Example: get all rows from your igcse table
  const { results } = await env.DB.prepare("SELECT * FROM igcse LIMIT 5").all();

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
}

