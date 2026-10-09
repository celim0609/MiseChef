// Latest snapshot wins; disposed workspaces must never publish late responses.
export const createNutritionRefresh = <T,>(load: () => Promise<T>, publish: (value: T) => void, fail: (error: unknown) => void, loading: () => void = () => {}) => {
  let active = true;
  let revision = 0;
  return {
    async refresh() {
      const current = ++revision;
      loading();
      try {
        const value = await load();
        if (active && current === revision) publish(value);
      } catch (error) { if (active && current === revision) fail(error); }
    },
    dispose() { active = false; revision++; }
  };
};
