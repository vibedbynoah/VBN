// functions/api/questions.ts
export const onRequestGet: PagesFunction = async ({ env, request }) => {
  const url = new URL(request.url);
  const subject = (url.searchParams.get("subject") || "").trim();
  const subtopic = (url.searchParams.get("subtopic") || "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 50);

  const like = `%${subtopic.toLowerCase()}%`;

  const stmt = env.DB.prepare(`
    SELECT 
      "question",
      "topic",
      "correct answer"   AS correct,
      "wrong answer 1"   AS wrong1,
      "wrong answer 2"   AS wrong2,
      "wrong answer 3"   AS wrong3
    FROM igcse
    WHERE (?1 = '' OR LOWER("topic") = LOWER(?1))
      AND (?2 = '' OR LOWER("question") LIKE ?3 OR LOWER("topic") LIKE ?3)
    ORDER BY RANDOM()
    LIMIT ?4
  `).bind(subject, subtopic, like, limit);

  const { results } = await stmt.all();
  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" }
  });
};
