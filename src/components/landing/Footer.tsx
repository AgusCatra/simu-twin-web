import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Mail, Phone, ShieldCheck, ArrowUpRight, ExternalLink } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full border-t border-slate-800 bg-slate-900 text-slate-300 py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 pb-12 border-b border-slate-800">
          {/* Columna 1: Identidad Institucional y Logo */}
          <div className="space-y-4">
            <div className="inline-block bg-white/95 px-6 py-4 rounded-2xl shadow-lg mb-4">
              <Image
                src="/images/logo-gobierno-vt.png"
                alt="Gobierno de Venado Tuerto"
                width={360}
                height={180}
                className="h-20 sm:h-24 md:h-28 lg:h-32 w-auto object-contain shrink-0"
              />
            </div>
            <div className="text-sm font-bold text-white tracking-tight">
              CENTRO DE ENTRENAMIENTO EN SIMULADORES
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Plataforma tecnológica municipal para el desarrollo de competencias operacionales seguras en maquinaria pesada, transporte de carga y simulación industrial.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0091B3]">
              <ShieldCheck className="h-4 w-4 text-[#0091B3]" />
              <span>Certificaciones con Validez Operativa</span>
            </div>
          </div>

          {/* Columna 2: Ubicación y Horarios */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
              Ubicación Institucional
            </h4>
            <div className="space-y-2 text-xs leading-relaxed">
              <div className="flex items-start gap-2 text-slate-300">
                <MapPin className="h-4 w-4 text-[#0091B3] shrink-0 mt-0.5" />
                <span>
                  Parque Industrial La Victoria · Venado Tuerto, Santa Fe
                </span>
              </div>
              <div className="text-[11px] text-slate-400 pt-1">
                Atención administrativa: Lunes a Viernes de 07:30 a 13:00 hs
              </div>
            </div>
          </div>

          {/* Columna 3: Saneamiento de Cursos - Capacitaciones y Empleo */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
              Capacitaciones y Empleo
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Los trayectos formativos, convocatorias e inscripciones son gestionados y canalizados a través de la Dirección de Empleo y la Secretaría de Desarrollo Productivo del Gobierno de Venado Tuerto.
            </p>
            <div>
              <a
                href="https://venadotuerto.gob.ar"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0091B3] hover:text-[#6EC1E4] hover:underline mt-2 transition-colors"
              >
                <span>Consultar Convocatorias Oficiales</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Columna 4: Contacto Municipal y Accesos */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
              Contacto Municipal
            </h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-300 text-[11px]">
                  simuladores@venadotuerto.gob.ar
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-slate-300 text-[11px]">
                  (03462) 421417 · Conmutador Oficial
                </span>
              </div>
              <div className="pt-2">
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0091B3] hover:text-[#6EC1E4] hover:underline transition-colors"
                >
                  <span>Portal de Instructores y SCADA</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Copyright */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2.5">
            <Image
              src="/images/icono-gobierno-vt.png"
              alt="Isotipo Gobierno de Venado Tuerto"
              width={24}
              height={24}
              className="h-5 w-5 rounded-xs object-contain"
            />
            <span>
              © 2026 Gobierno de Venado Tuerto · Secretaría de Desarrollo Productivo e Innovación.
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Gemelo Digital v2.4</span>
            <span>·</span>
            <span>Tecnología Three.js &amp; SCADA</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
