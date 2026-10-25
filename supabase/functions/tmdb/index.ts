// Supabase Edge Function "tmdb": calls TMDB with the site's shared key, so the key never reaches browsers.
// Deploy it as "tmdb" with JWT verification on, and set the secret TMDB_TOKEN to your
// TMDB API Read Access Token (or the 32-character API Key).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, accept, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });

  // /functions/v1/tmdb/movie/123 arrives as .../tmdb/movie/123; pass the rest on to TMDB.
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/tmdb(?=\/|$)/, "");
  if (!/^\/[\w/-]+$/.test(path)) return new Response("Bad path", { status: 400, headers: CORS });

  const token = Deno.env.get("TMDB_TOKEN") ?? "";
  const target = new URL("https://api.themoviedb.org/3" + path);
  url.searchParams.forEach((v, k) => { if (k !== "api_key") target.searchParams.set(k, v); });
  const headers: Record<string, string> = { accept: "application/json" };
  if (/^[0-9a-f]{32}$/i.test(token)) target.searchParams.set("api_key", token);
  else headers.Authorization = "Bearer " + token;

  const res = await fetch(target, { headers });
  return new Response(res.body, {
    status: res.status,
    headers: { ...CORS, "content-type": res.headers.get("content-type") ?? "application/json" }
  });
});
