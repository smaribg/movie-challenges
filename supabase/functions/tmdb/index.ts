// Supabase Edge Function "tmdb": calls TMDB with the site's shared key, so the key never reaches browsers.
// Deploy it as "tmdb" and set the secret TMDB_TOKEN to your TMDB API Read Access Token
// (or the 32-character API Key). Only people signed in to the site can use it.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, accept, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

// Sign-ins already checked, so a page loading many films doesn't ask Supabase every time.
const signedIn = new Map<string, number>();   // Authorization header -> time it stops being trusted

async function isSignedIn(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  if ((signedIn.get(auth) ?? 0) > Date.now()) return true;
  // The publishable key alone isn't a sign-in: Supabase only returns a user for a real session token.
  const res = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", {
    headers: { authorization: auth, apikey: req.headers.get("apikey") ?? "" }
  });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  if (!user?.id) return false;
  if (signedIn.size > 1000) signedIn.clear();
  signedIn.set(auth, Date.now() + 5 * 60e3);
  return true;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });
  if (!(await isSignedIn(req))) return new Response("Sign in to use this", { status: 401, headers: CORS });

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
