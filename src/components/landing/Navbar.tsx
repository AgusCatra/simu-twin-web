'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Cpu, Menu, X, UserCheck } from 'lucide-react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logotipo e Isotipo Institucional */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-zinc-900 to-zinc-950 shadow-md group-hover:border-amber-400/50 transition">
            <Cpu className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              CENTRO DE SIMULADORES
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                SCADA 3D
              </span>
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              Gobierno de Venado Tuerto // Innovación & Empleo
            </span>
          </div>
        </Link>

        {/* Enlaces de Navegación de Escritorio */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-300">
          <a
            href="#galpon-3d"
            className="hover:text-amber-400 transition font-mono text-xs uppercase tracking-wider"
          >
            Gemelo Digital
          </a>
          <a
            href="#metricas"
            className="hover:text-amber-400 transition font-mono text-xs uppercase tracking-wider"
          >
            Impacto
          </a>
          <a
            href="#visitas"
            className="hover:text-amber-400 transition font-mono text-xs uppercase tracking-wider"
          >
            Visitas Educativas
          </a>
          <a
            href="#capacitaciones"
            className="hover:text-amber-400 transition font-mono text-xs uppercase tracking-wider"
          >
            Programas
          </a>
        </nav>

        {/* Acceso a Plataforma / Instructores */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white shadow-sm"
          >
            <UserCheck className="h-4 w-4 text-emerald-400" />
            <span>Acceso Instructores</span>
          </Link>
        </div>

        {/* Botón Menú Móvil */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          aria-label="Abrir menú de navegación"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Menú Móvil Desplegable */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 px-4 pt-3 pb-6 space-y-3">
          <nav className="flex flex-col space-y-3 text-sm font-medium text-zinc-300">
            <a
              href="#galpon-3d"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-amber-400 transition font-mono text-xs uppercase"
            >
              Gemelo Digital 3D
            </a>
            <a
              href="#metricas"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-amber-400 transition font-mono text-xs uppercase"
            >
              Impacto y Métricas
            </a>
            <a
              href="#visitas"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-amber-400 transition font-mono text-xs uppercase"
            >
              Visitas Educativas y Consulta
            </a>
            <a
              href="#capacitaciones"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 hover:text-amber-400 transition font-mono text-xs uppercase"
            >
              Programas Técnicos
            </a>
          </nav>
          <div className="pt-3 border-t border-zinc-800">
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 text-xs font-semibold text-white"
            >
              <UserCheck className="h-4 w-4 text-emerald-400" />
              <span>Acceso Instructores</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
