// Last search/filter/sort of each list page, so "Üyelere dön" and the like
// return to the same list. Kept in memory only; a full reload resets it.
const lastSearches = new Map<string, string>();

/** `path` is the list page, e.g. "/members"; `search` has no leading "?" */
export function rememberListSearch(path: string, search: string) {
  lastSearches.set(path, search);
}

export function listHref(path: string) {
  const search = lastSearches.get(path);
  return search ? `${path}?${search}` : path;
}
