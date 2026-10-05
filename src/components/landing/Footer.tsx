import React from 'react';
import Link from 'next/link';
import { MapPin, Mail, Phone, Cpu, ShieldCheck, ArrowUpRight } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full border-t border-zinc-800 bg-zinc-950 text-zinc-400 py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 pb-12 border-b border-zinc-800/80">
          {/* Columna 1: Identidad Institucional */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
                <Cpu className="h-5 w-5 text-amber-400" />
              </div>
              <span className="font-mono text-sm font-bold text-white tracking-tight">
                CENTRO DE SIMULADORES
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Plataforma municipal de formación tecnológica avanzada para operarios de maquinaria pesada, transporte y logística.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>Certificaciones con Validez Operativa</span>
            </div>
          </div>

          {/* Columna 2: Ubicación e Infraestructura */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-200">
              Ubicación del Galpón
            </h4>
            <div className="space-y-2 text-xs leading-relaxed">
              <div className="flex items-start gap-2 text-zinc-300">
                <MapPin className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Galpón de Entrenamiento Técnico<br />
                  Parque Industrial La Victoria<br />
                  Venado Tuerto, Santa Fe, Argentina
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono pt-1">
                Lunes a Viernes de 07:30 a 18:00 hs
              </div>
            </div>
          </div>

          {/* Columna 3: Programas de Capacitación */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-200">
              Programas Formativos
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <span className="text-zinc-300 hover:text-amber-400 transition cursor-default">
                  Operador Seguro de Autoelevadores
                </span>
              </li>
              <li>
                <span className="text-zinc-300 hover:text-amber-400 transition cursor-default">
                  Pala Cargadora y Movimiento de Suelos
                </span>
              </li>
              <li>
                <span className="text-zinc-300 hover:text-amber-400 transition cursor-default">
                  Conducción Profesional de Camiones
                </span>
              </li>
              <li>
                <span className="text-zinc-300 hover:text-amber-400 transition cursor-default">
                  SimSpray Pintura Industrial en VR
                </span>
              </li>
              <li>
                <span className="text-zinc-300 hover:text-amber-400 transition cursor-default">
                  Izaje y Seguridad en Grúas Telescópicas
                </span>
              </li>
            </ul>
          </div>

          {/* Columna 4: Contacto Municipal y Accesos */}
          <div className="space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-200">
              Contacto Municipal
            </h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-zinc-400 shrink-0" />
                <span className="text-zinc-300 font-mono text-[11px]">
                  simuladores@venadotuerto.gob.ar
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-zinc-400 shrink-0" />
                <span className="text-zinc-300 font-mono text-[11px]">
                  (03462) 421417 / Int. 240
                </span>
              </div>
              <div className="pt-2">
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-400 hover:underline"
                >
                  <span>Portal de Instructores y SCADA</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Copyright */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-mono">
          <div>
            © 2026 Gobierno de Venado Tuerto · Secretaría de Desarrollo Productivo e Innovación.
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Gemelo Digital v2.4</span>
            <span>·</span>
            <span>Tecnología Three.js & SCADA</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
