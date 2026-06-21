import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/api/cron(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
