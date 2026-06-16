/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export default function LoginTab() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center animate-fade-in">
      <section className="w-full max-w-md bg-surface-container-low border border-surface-container-high rounded-2xl shadow-sm p-5 sm:p-7 space-y-6">
        <div className="text-center space-y-2">
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            Personal Cookbook
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary leading-tight">
            Welcome to Ce Lim's Kitchen
          </h2>
          <p className="font-sans text-sm font-bold text-on-surface-variant">
            Sign In
          </p>
        </div>

        <form className="space-y-4" onSubmit={event => event.preventDefault()}>
          <div className="space-y-1.5">
            <label className="font-sans font-bold text-xs text-on-surface-variant px-1">
              Email
            </label>
            <input
              type="email"
              placeholder="chef@example.com"
              className="w-full bg-white border border-surface-container-high rounded-xl px-4 py-3.5 text-sm font-sans font-bold text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-sans font-bold text-xs text-on-surface-variant px-1">
              Password
            </label>
            <input
              type="password"
              placeholder="Enter your password"
              className="w-full bg-white border border-surface-container-high rounded-xl px-4 py-3.5 text-sm font-sans font-bold text-on-surface placeholder:text-outline-variant focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-primary hover:bg-primary-container text-on-primary rounded-full px-5 py-3.5 text-sm font-sans font-extrabold active:scale-95 transition-all"
          >
            Continue
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-surface-container-high" />
          <span className="font-sans text-xs font-bold text-on-surface-variant">or</span>
          <div className="h-px flex-1 bg-surface-container-high" />
        </div>

        <button
          type="button"
          className="w-full bg-white border border-surface-container-high text-primary rounded-full px-5 py-3.5 text-sm font-sans font-extrabold active:scale-95 hover:border-primary transition-all"
        >
          Continue with Google
        </button>

        <p className="text-center font-sans text-xs font-extrabold text-secondary bg-secondary/10 border border-secondary/20 rounded-full px-4 py-2">
          Cloud Sync Coming Soon
        </p>
      </section>
    </div>
  );
}
