import { clerkMiddleware } from "@clerk/nextjs/server"

// Auth checks live on the resources themselves, not here: Clerk deprecated
// route-matcher middleware because path matching can diverge from how Next.js
// actually routes a request, leaving protected pages reachable. This only makes
// the session available to pages, layouts and server functions.
export default clerkMiddleware()

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
