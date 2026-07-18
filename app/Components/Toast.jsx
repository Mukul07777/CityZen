"use client";

import { useEffect } from "react";

// Minimal dependency-free replacement for MUI's <Snackbar>. Pulling in
// @mui/material for three toast popups dragged in @emotion/react as a
// transitive peer dep, which broke the Turbopack build once @emotion/react
// was removed in an earlier dependency cleanup pass. Not worth reinstalling
// @emotion just for this — a plain fixed div does the same job.
const Toast = ({ open, message, onClose, duration = 5000 }) => {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [open, duration, onClose]);

  if (!open) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-navy text-cream text-sm font-medium px-5 py-3 rounded-lg shadow-lg max-w-sm text-center">
      {message}
    </div>
  );
};

export default Toast;
