import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwt } from 'jose';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('jwt_token')?.value;

  let isExpired = true;
  if (token) {
    try {
      const decoded = decodeJwt(token);
      if (decoded.exp && (decoded.exp * 1000 > Date.now())) {
        isExpired = false;
      }
    } catch (e) {
      isExpired = true;
    }
  }

  const onLoginPage = request.nextUrl.pathname.startsWith('/login');

  if (isExpired && !onLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!isExpired && onLoginPage) {
    return NextResponse.redirect(new URL('/reception', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
