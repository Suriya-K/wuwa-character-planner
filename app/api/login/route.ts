import { AUTH_COOKIE, AUTH_MAX_AGE, login } from "@/lib/auth";

export async function POST(req: Request) {
  const password = (await req.formData()).get("password");
  const cookie = typeof password === "string" ? login(password) : undefined;
  // 303 so the browser follows with a GET
  if (!cookie) return Response.redirect(new URL("/login?error=1", req.url), 303);
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": `${AUTH_COOKIE}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_MAX_AGE}${secure}`,
    },
  });
}
