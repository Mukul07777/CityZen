"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

export default function Home() {
  const [stats, setStats] = useState({ districts: 0, resolved: 0, pending: 0 });

  useEffect(() => {
    const loadStats = async () => {
      const [{ count: districts }, { count: resolved }, { count: pending }] = await Promise.all([
        supabase.from("districts").select("*", { count: "exact", head: true }),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("tag", "Completed"),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("tag", "Pending"),
      ]);
      setStats({ districts: districts || 0, resolved: resolved || 0, pending: pending || 0 });
    };
    loadStats();
  }, []);

  return (
    <div className="bg-cream">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden border-b border-navy/10 min-h-[92vh] flex flex-col justify-center px-6 md:px-16 pt-10 pb-16"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(15,31,46,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,31,46,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        {/* decorative floating squares, top-right */}
        <div className="absolute top-10 right-10 hidden md:grid grid-cols-3 gap-2 opacity-90">
          <div className="w-6 h-6 rounded-sm bg-navy/20" />
          <div className="w-6 h-6 rounded-sm bg-gold" />
          <div className="w-6 h-6 rounded-sm bg-navy/20" />
          <div className="w-6 h-6 rounded-sm bg-navy" />
          <div className="w-6 h-6 rounded-sm bg-navy/20" />
          <div className="w-6 h-6 rounded-sm bg-gold-light" />
        </div>

        {/* badge pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-navy/20 bg-cream-card w-fit mb-8 text-sm font-medium text-navy/70">
          <span className="w-2 h-2 rounded-full bg-gold" />
          Real-time civic issue tracking
        </div>

        {/* headline */}
        <h1 className="text-[42px] sm:text-[56px] md:text-[68px] lg:text-[76px] font-extrabold leading-[1.05] max-w-4xl text-navy">
          Report Civic Issues{" "}
          <span className="text-gold">&amp; See Them</span>{" "}
          <span className="text-navy underline decoration-gold decoration-8 underline-offset-4">
            Actually Resolved
          </span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-navy/60 max-w-xl">
          CityZen connects citizens directly with the municipal official
          responsible for their district — no complaints lost in a void.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-4 mt-10">
          <Link
            href="/issues/new"
            className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-navy text-cream font-semibold hover:bg-navy-light transition"
          >
            Report an Issue <span aria-hidden>↗</span>
          </Link>
          <Link
            href="/browse"
            className="px-6 py-3.5 rounded-full border-2 border-navy text-navy font-semibold hover:bg-navy/5 transition"
          >
            Explore Issues
          </Link>
        </div>

        {/* quick facts strip — fills the space under the CTAs */}
        <div className="flex flex-wrap gap-x-10 gap-y-4 mt-14 max-w-xl">
          <div>
            <p className="text-2xl font-extrabold text-navy">5km</p>
            <p className="text-xs text-navy/50 mt-1">Radius shown per issue</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-navy">1</p>
            <p className="text-xs text-navy/50 mt-1">MCD official per district</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-navy">Live</p>
            <p className="text-xs text-navy/50 mt-1">Leaderboard &amp; status</p>
          </div>
        </div>

        {/* scroll cue */}
        <div className="hidden md:flex items-center gap-3 absolute left-8 bottom-24 text-navy/40">
          <span className="block w-px h-16 bg-navy/30" />
          <span className="[writing-mode:vertical-rl] text-xs tracking-widest font-semibold">
            SCROLL
          </span>
        </div>

        {/* scattered "how it works" cards — the main right-side visual */}
        <div className="hidden lg:block absolute right-8 top-1/2 -translate-y-1/2 w-[480px] h-[360px]">
          <div className="absolute top-0 left-0 w-52 bg-cream-card border border-navy/10 rounded-2xl shadow-xl p-5 -rotate-6 z-30">
            <span className="text-3xl">📍</span>
            <p className="font-bold text-navy text-lg mt-2">1. Report</p>
            <p className="text-navy/50 text-sm mt-0.5">Photo + GPS location</p>
          </div>

          <div className="absolute top-16 right-0 w-52 bg-navy rounded-2xl shadow-xl p-5 rotate-3 z-20">
            <span className="text-3xl">🏛️</span>
            <p className="font-bold text-cream text-lg mt-2">2. Auto-Routed</p>
            <p className="text-cream/60 text-sm mt-0.5">Nearest district's MCD</p>
          </div>

          <div className="absolute bottom-0 left-16 w-52 bg-gold rounded-2xl shadow-xl p-5 -rotate-2 z-10">
            <span className="text-3xl">✅</span>
            <p className="font-bold text-navy text-lg mt-2">3. Resolved</p>
            <p className="text-navy/70 text-sm mt-0.5">
              {stats.resolved > 0
                ? `${stats.resolved} issues closed with proof`
                : "With photo proof"}
            </p>
          </div>

          {/* dashed connector doodles, purely decorative */}
          <svg className="absolute inset-0 w-full h-full -z-10" viewBox="0 0 480 360" fill="none">
            <path
              d="M110 90 C 180 120, 220 140, 280 150"
              stroke="#0f1f2e"
              strokeOpacity="0.25"
              strokeWidth="2"
              strokeDasharray="6 8"
            />
            <path
              d="M300 210 C 260 250, 220 260, 190 290"
              stroke="#0f1f2e"
              strokeOpacity="0.25"
              strokeWidth="2"
              strokeDasharray="6 8"
            />
          </svg>
        </div>

        {/* floating bottom CTA pill */}
        <Link
          href="/issues/new"
          className="hidden md:flex items-center gap-3 absolute left-16 bottom-10 bg-navy text-cream font-semibold pl-6 pr-3 py-2.5 rounded-full shadow-lg hover:bg-navy-light transition"
        >
          Request a fix
          <span className="flex items-center bg-cream/10 rounded-full px-2 py-1 text-xs tracking-widest">
            »»»
          </span>
        </Link>
      </div>

      {/* ── Objective: photo + text row ──────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-24 grid md:grid-cols-2 gap-12 items-center">
        <div className="relative order-2 md:order-1">
          <div className="absolute -top-4 -left-4 w-full h-full rounded-2xl bg-gold/20 -z-10" />
          <div className="w-full h-[320px] rounded-2xl shadow-lg border border-navy/10 bg-navy flex items-center justify-center overflow-hidden">
            <svg viewBox="0 0 200 200" className="w-40 h-40">
              <rect x="55" y="70" width="90" height="100" rx="8" fill="#e8ddc7" />
              <rect x="50" y="55" width="100" height="18" rx="6" fill="#c9a24b" />
              <rect x="80" y="40" width="40" height="16" rx="4" fill="#c9a24b" />
              <line x1="75" y1="90" x2="75" y2="150" stroke="#0f1f2e" strokeWidth="4" strokeOpacity="0.3" />
              <line x1="100" y1="90" x2="100" y2="150" stroke="#0f1f2e" strokeWidth="4" strokeOpacity="0.3" />
              <line x1="125" y1="90" x2="125" y2="150" stroke="#0f1f2e" strokeWidth="4" strokeOpacity="0.3" />
              <path d="M20 175 Q40 155 65 170 Q90 150 115 172 Q140 150 165 168 Q180 158 190 172"
                fill="none" stroke="#c9a24b" strokeWidth="5" strokeLinecap="round" />
              <circle cx="35" cy="185" r="7" fill="#c9a24b" opacity="0.6" />
              <circle cx="160" cy="182" r="5" fill="#c9a24b" opacity="0.4" />
            </svg>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-gold mb-3">
            The Problem
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-navy mb-5">Objective</h2>
          <p className="text-lg text-navy/70 leading-relaxed">
            Our goal is to empower citizens to address local neighborhood issues
            efficiently by providing a platform for reporting and tracking problems
            like garbage disposal, damaged roads, malfunctioning electricity poles,
            and other civic concerns.
          </p>
        </div>
      </section>

      {/* ── Idea: photo + text row, reversed ─────────────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-gold mb-3">
            The Fix
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-navy mb-5">Idea</h2>
          <p className="text-lg text-navy/70 leading-relaxed">
            Many areas face issues like garbage, broken roads, and poor maintenance,
            but there's no easy way for locals to report them and see progress. CityZen
            connects everyday people directly with their district's municipal officials
            and makes the whole resolution process visible and accountable.
          </p>
        </div>
        <div className="relative">
          <div className="absolute -bottom-4 -right-4 w-full h-full rounded-2xl bg-navy/10 -z-10" />
          <div className="w-full h-[320px] rounded-2xl shadow-lg border border-navy/10 bg-gold-light/40 flex items-center justify-center overflow-hidden">
            <svg viewBox="0 0 220 160" className="w-52 h-40">
              <rect x="0" y="80" width="220" height="60" fill="#0f1f2e" opacity="0.85" />
              <path d="M0 100 H90 L100 90 L112 105 L125 88 L140 100 H220" stroke="#e8ddc7" strokeWidth="3" fill="none" strokeDasharray="10 8" opacity="0.6" />
              <ellipse cx="100" cy="112" rx="30" ry="14" fill="#0a1620" />
              <ellipse cx="100" cy="110" rx="24" ry="10" fill="#1a2f42" />
              <rect x="150" y="55" width="10" height="35" fill="#c9a24b" />
              <polygon points="140,40 170,40 155,58" fill="#c9a24b" />
              <text x="155" y="52" fontSize="9" fill="#0f1f2e" textAnchor="middle" fontWeight="bold">!</text>
              <circle cx="35" cy="60" r="10" fill="#c9a24b" opacity="0.5" />
              <circle cx="55" cy="45" r="6" fill="#c9a24b" opacity="0.3" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── How It Works: three photo cards ───────────────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-24">
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-gold mb-3">
            The Process
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-navy">How It Works</h2>
          <p className="text-lg text-navy/60 max-w-2xl mx-auto mt-4">
            Report an issue with a photo, a category, and your location — CityZen
            automatically detects which district it falls under. The assigned MCD
            official reviews it and marks it resolved with photo proof once the work
            is done.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              bg: "bg-navy",
              icon: (
                <svg viewBox="0 0 100 100" className="w-16 h-16">
                  <rect x="25" y="15" width="50" height="70" rx="8" fill="#e8ddc7" />
                  <rect x="32" y="24" width="36" height="44" rx="3" fill="#0f1f2e" />
                  <circle cx="50" cy="46" r="10" fill="none" stroke="#c9a24b" strokeWidth="3" />
                  <circle cx="50" cy="46" r="4" fill="#c9a24b" />
                  <circle cx="50" cy="76" r="3" fill="#0f1f2e" />
                  <path d="M50 90 L44 100 L56 100 Z" fill="#c9a24b" />
                </svg>
              ),
              step: "1. Snap & Report",
              text: "Take a photo of the issue, GPS pinpoints the exact spot.",
            },
            {
              bg: "bg-gold",
              icon: (
                <svg viewBox="0 0 100 100" className="w-16 h-16">
                  <rect x="35" y="30" width="30" height="45" fill="#0f1f2e" />
                  <polygon points="30,30 70,30 50,10" fill="#0f1f2e" />
                  <rect x="42" y="45" width="6" height="6" fill="#e8ddc7" />
                  <rect x="52" y="45" width="6" height="6" fill="#e8ddc7" />
                  <rect x="42" y="58" width="6" height="6" fill="#e8ddc7" />
                  <rect x="52" y="58" width="6" height="6" fill="#e8ddc7" />
                  <path d="M20 85 L80 85" stroke="#0f1f2e" strokeWidth="4" strokeLinecap="round" />
                  <path d="M65 55 Q85 55 85 75" fill="none" stroke="#0f1f2e" strokeWidth="3" strokeDasharray="4 4" />
                  <circle cx="85" cy="78" r="5" fill="#0f1f2e" />
                </svg>
              ),
              step: "2. Routed to MCD",
              text: "Auto-detected district sends it straight to the responsible official.",
            },
            {
              bg: "bg-navy",
              icon: (
                <svg viewBox="0 0 100 100" className="w-16 h-16">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#c9a24b" strokeWidth="5" />
                  <path d="M32 52 L45 65 L70 36" fill="none" stroke="#e8ddc7" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ),
              step: "3. Cleaned & Closed",
              text: "Resolved with photo proof — visible to everyone tracking it.",
            },
          ].map((card) => (
            <div
              key={card.step}
              className="rounded-2xl overflow-hidden border border-navy/10 shadow-sm bg-cream-card hover:shadow-lg transition"
            >
              <div className={`w-full h-[180px] flex items-center justify-center ${card.bg}`}>
                {card.icon}
              </div>
              <div className="p-5">
                <p className="font-bold text-navy mb-1">{card.step}</p>
                <p className="text-sm text-navy/60">{card.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Under the Hood: dark highlight band ──────────────── */}
      <section className="bg-navy py-24 px-6 md:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold tracking-widest uppercase text-gold mb-3">
              The Engine
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-cream">Under the Hood</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="bg-cream/5 border border-cream/10 rounded-2xl p-6">
              <span className="text-3xl">⚡</span>
              <p className="font-bold text-cream mt-4 mb-2">Supabase</p>
              <p className="text-sm text-cream/60 leading-relaxed">
                Postgres database, authentication, file storage, and real-time
                updates — issues and leaderboard scores update live for everyone
                viewing the app.
              </p>
            </div>
            <div className="bg-cream/5 border border-cream/10 rounded-2xl p-6">
              <span className="text-3xl">📍</span>
              <p className="font-bold text-cream mt-4 mb-2">Geolocation</p>
              <p className="text-sm text-cream/60 leading-relaxed">
                Browser GPS captures exactly where an issue was reported and
                auto-detects the nearest district by distance.
              </p>
            </div>
            <div className="bg-cream/5 border border-cream/10 rounded-2xl p-6">
              <span className="text-3xl">🔒</span>
              <p className="font-bold text-cream mt-4 mb-2">Row-Level Security</p>
              <p className="text-sm text-cream/60 leading-relaxed">
                Only the MCD official assigned to a district can mark its issues
                resolved, and only with photo proof — enforced in the database,
                not just the UI.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
