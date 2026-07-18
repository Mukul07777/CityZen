"use client";

import React from "react";

// Order-tracking-style stepper: Reported -> Seen by MCD -> Resolved.
// "Reported" is always complete (the post exists). "Seen" completes once
// an MCD official acknowledges it (mark_seen()). "Resolved" completes
// once complete_issue() runs. This is deliberately three fixed stages,
// not a percentage — there's no sub-task breakdown to show finer detail.
const ProgressTracker = ({ seen, resolved, seenAt, resolvedAt, createdAt }) => {
  const steps = [
    { label: "Reported", done: true, at: createdAt },
    { label: "Seen by MCD", done: seen || resolved, at: seenAt },
    { label: "Resolved", done: resolved, at: resolvedAt },
  ];

  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString() : null);

  return (
    <div className="flex items-start w-full">
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step.done ? "bg-navy text-cream" : "bg-navy/10 text-navy/30"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </div>
            <p className={`text-xs mt-2 text-center font-medium ${step.done ? "text-navy" : "text-navy/40"}`}>
              {step.label}
            </p>
            {step.done && fmt(step.at) && (
              <p className="text-[10px] text-navy/40 mt-0.5">{fmt(step.at)}</p>
            )}
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-[2px] flex-1 mt-4 ${
                steps[i + 1].done ? "bg-navy" : "bg-navy/10"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default ProgressTracker;
