import { type NextRequest, NextResponse } from 'next/server';

/** Set by the API alongside the httpOnly auth cookies; holds no secret. */
const SESSION_COOKIE = 'sms_session';

/**
 * Route protection (spec §8): no session → /login. This only checks that a session
 * cookie exists; the API validates the tokens and enforces permissions on every call,
 * and the app layout hides screens the role can't use.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isLogin = pathname === '/login';

  if (!hasSession && !isLogin) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API rewrite, Next internals and static files.
  matcher: ['/((?!api/|_next/|favicon.ico|.*\\..*).*)'],
};
