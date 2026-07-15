/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Menu, Plus, Search } from 'lucide-react';
import { RootTab, Workspace } from '../types';
import BrandLogo from './BrandLogo';

interface HeaderProps {
  title?: string;
  isSubpage?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  activeTab?: RootTab;
  chefAvatarUrl?: string;
  chefName?: string;
  showAvatar?: boolean;
  onMenuClick?: () => void;
  onAvatarClick?: () => void;
  workspaces?: Workspace[];
  currentWorkspace?: Workspace | null;
  onWorkspaceChange?: (workspaceId: string) => void;
}

type WorkspaceGroup = 'Personal' | 'Company';

const getWorkspaceGroup = (workspace: Workspace): WorkspaceGroup => {
  return workspace.id === workspace.ownerId ? 'Personal' : 'Company';
};

const getWorkspaceInitials = (workspace: Workspace) => workspace.name
  .split(/\s+/)
  .filter(Boolean)
  .map(part => part.charAt(0))
  .join('')
  .slice(0, 2)
  .toUpperCase() || 'MC';

const groupOrder: WorkspaceGroup[] = ['Personal', 'Company'];

export default function Header({
  title = "MiseChef",
  isSubpage = false,
  onBack,
  rightAction,
  activeTab,
  chefAvatarUrl = "",
  chefName = "User profile",
  showAvatar = false,
  onMenuClick,
  onAvatarClick,
  workspaces = [],
  currentWorkspace = null,
  onWorkspaceChange
}: HeaderProps) {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);

  const avatarInitials = chefName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'MC';

  const workspaceGroups = useMemo(() => {
    const uniqueWorkspaces = Array.from(
      workspaces.reduce<Map<string, Workspace>>((acc, workspace) => {
        if (!acc.has(workspace.id)) acc.set(workspace.id, workspace);
        return acc;
      }, new Map()).values()
    );

    return groupOrder
      .map(group => ({
        group,
        workspaces: uniqueWorkspaces.filter(workspace => getWorkspaceGroup(workspace) === group)
      }))
      .filter(item => item.workspaces.length > 0);
  }, [workspaces]);

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsWorkspaceMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isWorkspaceMenuOpen]);

  const handleWorkspaceSelect = (workspaceId: string) => {
    onWorkspaceChange?.(workspaceId);
    setIsWorkspaceMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 w-full z-50 h-16 bg-surface/85 backdrop-blur-md border-b border-surface-container-high transition-all">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 md:px-8 flex justify-between items-center">
        {/* Left Side */}
        <div className="flex items-center gap-3 min-w-0">
          {isSubpage ? (
            <button
              onClick={onBack}
              id="header-back-btn"
              className="p-2 -ml-2 rounded-full hover:bg-surface-container active:scale-95 transition-all text-primary"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              id="header-menu-btn"
              onClick={onMenuClick}
              className="p-2 -ml-2 rounded-full hover:bg-surface-container active:scale-95 transition-all text-primary"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          
          <div className="flex items-center gap-2.5 min-w-0">
            {title === "MiseChef" && (
              <BrandLogo className="h-8 sm:h-9 w-auto shrink-0" />
            )}
            <div className="leading-tight min-w-0">
              <h1 className={`text-xl sm:text-2xl text-primary font-semibold tracking-tight ${title === "MiseChef" ? "font-display italic" : "font-display"}`}>
                {title}
              </h1>
              {!isSubpage && (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <p className="font-sans text-[10px] sm:text-xs text-secondary font-bold tracking-wide">
                    Everything in its place.
                  </p>
                  <p className="font-sans text-[8px] sm:text-[9px] text-outline font-extrabold uppercase tracking-[0.16em]">
                    by Ce Lim
                  </p>
                </div>
              )}
            </div>
          </div>

          {!isSubpage && currentWorkspace && (
            <div ref={switcherRef} className="relative block">
              <button
                type="button"
                onClick={() => setIsWorkspaceMenuOpen(prev => !prev)}
                className="group flex min-w-[190px] max-w-[280px] items-center gap-2 rounded-2xl border border-surface-container-high bg-surface-container-low/90 px-2.5 py-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/10"
                aria-haspopup="menu"
                aria-expanded={isWorkspaceMenuOpen}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-[11px] font-display font-bold text-on-primary shadow-sm shadow-primary/20">
                  {getWorkspaceInitials(currentWorkspace)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-sans text-xs font-extrabold text-primary">{currentWorkspace.name}</span>
                  </span>
                  <span className="block truncate font-sans text-[10px] font-bold text-on-surface-variant">
                    {getWorkspaceGroup(currentWorkspace)} workspace
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-outline transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isWorkspaceMenuOpen && (
                <div className="absolute left-0 top-full z-[80] mt-2 w-[320px] overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-2xl shadow-primary/15 ring-1 ring-primary/5">
                  <div className="border-b border-surface-container-high p-3">
                    <div className="flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2 text-outline">
                      <Search className="h-3.5 w-3.5" />
                      <span className="font-sans text-xs font-bold">Workspace search coming soon</span>
                    </div>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto p-2">
                    {workspaceGroups.map(group => (
                      <div key={group.group} className="py-1.5">
                        <p className="px-3 pb-1.5 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">
                          {group.group}
                        </p>
                        <div className="space-y-1">
                          {group.workspaces.map(workspace => {
                            const isSelected = workspace.id === currentWorkspace.id;
                            return (
                              <button
                                key={workspace.id}
                                type="button"
                                onClick={() => handleWorkspaceSelect(workspace.id)}
                                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
                                  isSelected
                                    ? 'bg-primary/10 text-primary shadow-sm'
                                    : 'text-primary hover:bg-surface-container-low'
                                }`}
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-xs font-bold text-on-primary">
                                  {getWorkspaceInitials(workspace)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="truncate font-sans text-sm font-extrabold">{workspace.name}</span>
                                  </span>
                                  <span className="block truncate font-sans text-[11px] font-bold text-on-surface-variant">
                                    {getWorkspaceGroup(workspace)} workspace
                                  </span>
                                </span>
                                {isSelected && <Check className="h-4 w-4 shrink-0 text-secondary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-surface-container-high p-2">
                    <button
                      type="button"
                      disabled
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-outline opacity-80"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container-high">
                        <Plus className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block font-sans text-sm font-extrabold text-primary">Create Workspace</span>
                        <span className="block font-sans text-[11px] font-bold text-on-surface-variant">Coming soon</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {rightAction ? (
            rightAction
          ) : showAvatar ? (
            <button
              type="button"
              onClick={onAvatarClick}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 border-primary shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/25 hover:scale-105 transition-all cursor-pointer bg-primary text-on-primary flex items-center justify-center"
              aria-label="Open account settings"
            >
              {chefAvatarUrl ? (
                <img
                  src={chefAvatarUrl}
                  alt={chefName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="font-display text-sm sm:text-base font-bold leading-none">
                  {avatarInitials}
                </span>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
