# 03: Password gate and Vercel deploy

**What to build:** The app is deployed to Vercel and reachable from phone/tablet, but only after entering a single password (`APP_PASSWORD` env). Login sets a signed httpOnly cookie lasting 90 days. Every page and every API route (especially the Gemini one, whose key lives in Vercel env) refuses unauthenticated requests.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Opening any page without the cookie lands on the login form
- [ ] Calling the OCR API without the cookie is rejected without reaching Gemini
- [ ] A wrong password does not set the cookie
- [ ] After login, the stat check works on the deployed URL from a phone
