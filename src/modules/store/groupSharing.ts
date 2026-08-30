export const getCanonicalGroupUrl = (origin: string, groupId: string) => {
  const url = new URL(`/group/${encodeURIComponent(groupId)}`, origin);
  return url.toString();
};

export const getGroupShareData = (origin: string, group: { shareCode: string; name: string }) => ({
  title: group.name,
  url: getCanonicalGroupUrl(origin, group.shareCode)
});
