// Supabase Edge Function "tmdb": calls TMDB with the site's shared key, so the key never reaches browsers.
// Deploy it as "tmdb" with JWT verification on, and set the secret TMDB_TOKEN to your
// TMDB API Read Access Token (or the 32-character API Key).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, accept, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

// Access tokens already checked with Supabase Auth, kept for a few minutes so a page load of many
// TMDB calls doesn't check the same token every time.
const checked = new Map<string, number>();
async function signedIn(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.startsWith("sb_")) return false;
  if ((checked.get(jwt) ?? 0) > Date.now()) return true;
  const res = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: req.headers.get("apikey") || (Deno.env.get("SUPABASE_ANON_KEY") ?? ""), Authorization: "Bearer " + jwt }
  });
  if (!res.ok) return false;
  if (checked.size > 1000) checked.clear();
  checked.set(jwt, Date.now() + 5 * 60_000);
  return true;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });

  // /functions/v1/tmdb/movie/123 arrives as .../tmdb/movie/123; pass the rest on to TMDB.
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/tmdb(?=\/|$)/, "");
  if (!/^\/[\w/-]+$/.test(path)) return new Response("Bad path", { status: 400, headers: CORS });

  // The gateway lets the public publishable key through on its own, so check for a signed-in user here.
  if (!(await signedIn(req))) return new Response("Sign in first", { status: 401, headers: CORS });

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
