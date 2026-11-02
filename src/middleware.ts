import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresca/protege la sesión solo en las rutas que de verdad la necesitan.
 * - /admin/*, /cabina/* y /login: validación dura contra el servidor (getUser, round-trip de red).
 * - /visitas (pública dentro del matcher): solo lectura de cookie (getSession), sin red.
 *
 * Robustez: si faltan las variables de entorno en el borde, NO se lanza Error
 * (evita un 500 en todo el sitio). Las rutas públicas pasan con next(); /admin/*
 * y /cabina/* se redirigen de forma controlada a /login. La validación dura de
 * env vive en lib/supabase/client.ts y server.ts, que sí lanzan un Error claro
 * en español.
 */
async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const esRutaAdmin = pathname.startsWith('/admin');
  // FIX F10: boundary exacto para no sobre-matchear rutas tipo /cabinaX.
  const esRutaCabina = pathname === '/cabina' || pathname.startsWith('/cabina/');
  const esRutaGestion = pathname === '/gestion' || pathname.startsWith('/gestion/');
  const esRutaLogin = pathname === '/login';
  const esRutaProtegida = esRutaAdmin || esRutaCabina || esRutaGestion || esRutaLogin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Sin env en el borde: no tumbar el sitio.
    if (esRutaAdmin || esRutaCabina || esRutaGestion) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Rutas públicas: solo lectura de cookie (sin round-trip de red) para mantener
  // la sesión fresca si existe, y dejar pasar siempre.
  if (!esRutaProtegida) {
    await supabase.auth.getSession();
    return supabaseResponse;
  }

  // Rutas protegidas: IMPORTANTE no tocar la response entre createServerClient y
  // getUser(), o el token renovado se pierde y la sesión queda cerrada.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && (esRutaAdmin || esRutaCabina || esRutaGestion)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  if (user && esRutaLogin) {
    const adminUrl = request.nextUrl.clone();
    adminUrl.pathname = '/admin';
    adminUrl.search = '';
    return NextResponse.redirect(adminUrl);
  }

  return supabaseResponse;
}

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Matcher ACOTADO a las rutas que necesitan control de sesión:
     * /admin/*, /cabina/*, /gestion/*, /login y /visitas. Se excluyen los assets internos
     * de Next (_next/static, _next/image), favicon y cualquier archivo estático
     * por extensión —incluidos los modelos 3D/tipografías/medios/documentos de
     * la futura landing— para no ejecutar el middleware en peticiones que no lo
     * requieren (assets, payloads RSC, POST de Server Actions, etc.).
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|gltf|hdr|ktx2|bin|draco|woff|woff2|ttf|mp4|webm|json|webmanifest|pdf|avif)$)(?:admin|cabina|gestion|login|visitas)(?:/.*)?)',
  ],
};
