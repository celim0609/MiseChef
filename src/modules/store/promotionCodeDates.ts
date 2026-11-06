export const mytInputValue = (value: string | null) =>
  value
    ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16)
    : "";
export const mytInputToIso = (value: string) =>
  value ? new Date(`${value}:00+08:00`).toISOString() : null;
