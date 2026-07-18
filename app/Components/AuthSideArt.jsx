"use client";

import React from "react";

// Illustrated scene for the login/signup right side — a city skyline with
// lit windows plus the same "pin → building → checkmark" story beats used
// on the homepage hero, so the auth pages feel like part of the same
// product instead of a generic template. Drawn with no background box of
// its own (transparent), so it sits directly on the shared page background
// with no seam.
const AuthSideArt = () => {
  const buildings = [
    { x: 20, w: 34, h: 90 },
    { x: 58, w: 26, h: 130 },
    { x: 88, w: 40, h: 75 },
    { x: 132, w: 30, h: 150 },
    { x: 166, w: 34, h: 100 },
    { x: 204, w: 26, h: 120 },
    { x: 234, w: 38, h: 80 },
    { x: 276, w: 30, h: 145 },
    { x: 310, w: 34, h: 95 },
  ];

  return (
    <div className="relative w-full h-[420px] flex items-end justify-center select-none">
      {/* CityZen wordmark, floating above the skyline */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center z-10">
        <p className="text-2xl font-extrabold tracking-wide text-cream">CITYZEN</p>
        <p className="text-xs text-gold/80 tracking-widest mt-1">URBAN LIVING PERFECTED</p>
      </div>

      {/* floating story cards, echoing the homepage's report -> routed -> resolved cards */}
      <div className="absolute top-16 left-2 bg-cream-card rounded-xl shadow-lg px-3 py-2 -rotate-6 z-10">
        <p className="text-[11px] font-bold text-navy">📍 Reported</p>
      </div>
      <div className="absolute top-24 right-0 bg-navy border border-cream/20 rounded-xl shadow-lg px-3 py-2 rotate-3 z-10">
        <p className="text-[11px] font-bold text-cream">🏛️ Routed</p>
      </div>
      <div className="absolute top-40 left-8 bg-gold rounded-xl shadow-lg px-3 py-2 -rotate-2 z-10">
        <p className="text-[11px] font-bold text-navy">✅ Resolved</p>
      </div>

      {/* soft gold glow behind the skyline */}
      <div className="pointer-events-none absolute bottom-10 w-72 h-72 rounded-full bg-gold/10 blur-3xl" />

      {/* skyline */}
      <svg viewBox="0 0 360 170" className="relative w-full max-w-[360px] h-auto">
        {buildings.map((b, i) => (
          <g key={i}>
            <rect
              x={b.x}
              y={170 - b.h}
              width={b.w}
              height={b.h}
              fill={i % 2 === 0 ? "#e8ddc7" : "#c9a24b"}
              opacity={i % 2 === 0 ? 0.14 : 0.22}
            />
            {/* lit windows */}
            {Array.from({ length: Math.floor(b.h / 22) }).map((_, r) =>
              Array.from({ length: Math.floor(b.w / 14) }).map((_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={b.x + 6 + c * 14}
                  y={170 - b.h + 10 + r * 22}
                  width="6"
                  height="8"
                  fill="#c9a24b"
                  opacity={(i + r + c) % 3 === 0 ? 0.9 : 0.25}
                />
              ))
            )}
          </g>
        ))}
        <rect x="0" y="168" width="360" height="2" fill="#c9a24b" opacity="0.4" />
      </svg>
    </div>
  );
};

export default AuthSideArt;
