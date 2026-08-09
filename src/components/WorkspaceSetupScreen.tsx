import React from 'react';
import { motion } from 'motion/react';
import BrandLogo from './BrandLogo';

export default function WorkspaceSetupScreen({ error = '' }: { error?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-surface-container-high bg-surface-container-low p-8 text-center shadow-sm"
      >
        <BrandLogo className="mx-auto h-10 w-auto" />
        <h1 className="mt-6 font-display text-3xl font-semibold text-primary">Setting up your workspace…</h1>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">
          {error || 'Preparing your profile, Owner access, and Professional trial.'}
        </p>
      </motion.section>
    </div>
  );
}
