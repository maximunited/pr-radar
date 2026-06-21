import { clerkMiddleware } from "@clerk/nextjs/server";

// All routes are public. Clerk session is available when signed in,
// but no redirect is forced — GITHUB_TOKEN covers unauthenticated access.
export default clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
