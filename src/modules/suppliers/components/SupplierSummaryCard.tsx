import type { ReactNode } from 'react';

interface SupplierSummaryCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  helper?: string;
}

export default function SupplierSummaryCard({ label, value, icon, helper }: SupplierSummaryCardProps) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-primary/10 p-2 text-primary">{icon}</span>
      </div>
      <p className="mt-5 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold text-primary">{value}</p>
      {helper && <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">{helper}</p>}
    </article>
  );
}
