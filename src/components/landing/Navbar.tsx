'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Cpu, Menu, X, UserCheck } from 'lucide-react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logotipo e Isotipo Institucional */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition group-hover:bg-emerald-700">
            <Cpu className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
              CENTRO DE ENTRENAMIENTO EN SIMULADORES
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                SCADA 3D
              </span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-700">
              Gobierno de Venado Tuerto
            </span>
          </div>
        </Link>

        {/* Enlaces de Navegación de Escritorio */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#galpon-3d"
            className="hover:text-emerald-600 transition text-xs font-semibold uppercase tracking-wider"
          >
            Gemelo Digital
          </a>
          <a
            href="#metricas"
            className="hover:text-emerald-600 transition text-xs font-semibold uppercase tracking-wider"
          >
            Impacto
          </a>
          <a
            href="#visitas"
            className="hover:text-emerald-600 transition text-xs font-semibold uppercase tracking-wider"
          >
            Visitas Educativas
          </a>
          <a
            href="#capacitaciones"
            className="hover:text-emerald-600 transition text-xs font-semibold uppercase tracking-wider"
          >
            Programas
          </a>
        </nav>

        {/* Acceso a Plataforma / Instructores */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-800 transition shadow-sm"
          >
            <UserCheck className="h-4 w-4 text-emerald-700" />
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
              className="py-1 hover:text-emerald-600 transition text-xs font-semibold uppercase"
            >
              Gemelo Digital 3D
            </a>
            <a
              href="#metricas"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-emerald-600 transition text-xs font-semibold uppercase"
            >
              Impacto y Métricas
            </a>
            <a
              href="#visitas"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-emerald-600 transition text-xs font-semibold uppercase"
            >
              Visitas Educativas y Consulta
            </a>
            <a
              href="#capacitaciones"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-emerald-600 transition text-xs font-semibold uppercase"
            >
              Programas Técnicos
            </a>
          </nav>
          <div className="pt-3 border-t border-slate-200">
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 py-2.5 text-xs font-semibold text-slate-800 transition"
            >
              <UserCheck className="h-4 w-4 text-emerald-700" />
              <span>Acceso Instructores</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
