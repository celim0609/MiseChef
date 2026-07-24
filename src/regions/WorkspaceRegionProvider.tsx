import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Workspace } from '../types';
import { DEFAULT_REGION_CONFIGURATION } from './config';
import { getWorkspaceRegionConfiguration } from './regionService';
import type { RegionConfiguration } from './types';

const WorkspaceRegionContext = createContext<RegionConfiguration>(DEFAULT_REGION_CONFIGURATION);

interface WorkspaceRegionProviderProps {
  workspace?: Pick<Workspace, 'country'> | null;
  children: ReactNode;
}

export function WorkspaceRegionProvider({ workspace, children }: WorkspaceRegionProviderProps) {
  const configuration = useMemo(
    () => getWorkspaceRegionConfiguration(workspace),
    [workspace?.country]
  );

  return (
    <WorkspaceRegionContext.Provider value={configuration}>
      {children}
    </WorkspaceRegionContext.Provider>
  );
}

export const useWorkspaceRegion = () => useContext(WorkspaceRegionContext);
