'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, UserCheck } from 'lucide-react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-20 sm:h-26 md:h-30 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
        {/* Logotipo e Isotipo Institucional */}
        <Link href="/" className="flex items-center gap-2.5 sm:gap-4 group min-w-0 pr-2">
          <Image
            src="/images/logo-gobierno-vt.png"
            alt="Gobierno de Venado Tuerto"
            width={320}
            height={160}
            className="h-14 sm:h-18 md:h-22 lg:h-26 w-auto object-contain shrink-0 transition-transform group-hover:scale-105"
            priority
          />
          <div className="flex flex-col justify-center min-w-0">
            <span className="text-xs sm:text-base md:text-lg font-extrabold text-slate-900 leading-tight truncate sm:whitespace-normal">
              CENTRO DE ENTRENAMIENTO EN SIMULADORES
            </span>
            <span className="text-[11px] sm:text-sm font-semibold text-[#0091B3] tracking-wide truncate sm:whitespace-normal">
              Gobierno de Venado Tuerto
            </span>
          </div>
        </Link>

        {/* Enlaces de Navegación de Escritorio */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#galpon-3d"
            className="hover:text-[#0091B3] transition text-xs font-semibold uppercase tracking-wider"
          >
            Gemelo Digital
          </a>
          <a
            href="#metricas"
            className="hover:text-[#0091B3] transition text-xs font-semibold uppercase tracking-wider"
          >
            Impacto
          </a>
          <a
            href="#experiencias"
            className="hover:text-[#0091B3] transition text-xs font-semibold uppercase tracking-wider"
          >
            Experiencias
          </a>
          <a
            href="#visitas"
            className="hover:text-[#0091B3] transition text-xs font-semibold uppercase tracking-wider"
          >
            Visitas Educativas
          </a>
        </nav>

        {/* Acceso a Plataforma / Instructores */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 transition shadow-sm hover:border-[#0091B3] hover:text-[#0091B3]"
          >
            <UserCheck className="h-4 w-4 text-[#0091B3]" />
            <span>Acceso Instructores</span>
          </Link>
        </div>

        {/* Botón Menú Móvil */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          aria-label="Abrir menú de navegación"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Menú Móvil Desplegable */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 shadow-lg">
          <nav className="flex flex-col space-y-3 text-sm font-medium text-slate-600">
            <a
              href="#galpon-3d"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-[#0091B3] transition text-xs font-semibold uppercase"
            >
              Gemelo Digital 3D
            </a>
            <a
              href="#metricas"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-[#0091B3] transition text-xs font-semibold uppercase"
            >
              Impacto y Métricas
            </a>
            <a
              href="#experiencias"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-[#0091B3] transition text-xs font-semibold uppercase"
            >
              Experiencias Escolares
            </a>
            <a
              href="#visitas"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-[#0091B3] transition text-xs font-semibold uppercase"
            >
              Visitas Educativas y Consulta
            </a>
          </nav>
          <div className="pt-3 border-t border-slate-200">
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-300 bg-white hover:bg-slate-50 py-2.5 text-xs font-semibold text-slate-800 transition hover:border-[#0091B3] hover:text-[#0091B3]"
            >
              <UserCheck className="h-4 w-4 text-[#0091B3]" />
              <span>Acceso Instructores</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
