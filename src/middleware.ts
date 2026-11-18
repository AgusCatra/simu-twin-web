import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  normalizarRolSistema,
  obtenerRutaInicialPorRol,
  puedeAccederRuta,
} from '@/lib/auth/matriz-permisos';

/**
 * Refresca/protege la sesión solo en las rutas que de verdad la necesitan y
 * aplica control RBAC por rol de `public.perfiles_usuarios`.
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

  if (user && esRutaProtegida) {
    const { data: filaPerfil } = await supabase
      .from('perfiles_usuarios')
      .select('rol')
      .eq('id', user.id)
      .maybeSingle<{ rol: string | null }>();

    const emailLow = (user.email ?? '').trim().toLowerCase();
    const esAdminPrincipal =
      emailLow === 'catramado@gmail.com' ||
      emailLow === 'catramado17@gmail.com';
    // Fail-Safe: usuario autenticado sin fila o cuenta principal se trata como superadmin.
    const rol = esAdminPrincipal
      ? 'superadmin'
      : normalizarRolSistema(filaPerfil?.rol);
    const rutaInicial = obtenerRutaInicialPorRol(rol);

    if (esRutaLogin) {
      const targetUrl = request.nextUrl.clone();
      targetUrl.pathname = rutaInicial;
      targetUrl.search = '';
      const redirectRes = NextResponse.redirect(targetUrl);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value, c);
      });
      return redirectRes;
    }

    if (
      (esRutaAdmin || esRutaCabina || esRutaGestion) &&
      !puedeAccederRuta(rol, pathname)
    ) {
      const fallbackUrl = request.nextUrl.clone();
      fallbackUrl.pathname = rutaInicial;
      fallbackUrl.search = '';
      const redirectRes = NextResponse.redirect(fallbackUrl);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectRes.cookies.set(c.name, c.value, c);
      });
      return redirectRes;
    }
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
