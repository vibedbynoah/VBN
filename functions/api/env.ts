export const onRequestGet: PagesFunction = async ({ env }) => {
  return new Response(JSON.stringify({ keys: Object.keys(env) }), {
    headers: { "Content-Type": "application/json" }
  });
};
