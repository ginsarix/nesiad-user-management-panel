// Last search/filter/sort of the members list, so "Üyelere dön" on a member
// page returns to the same list. Kept in memory only; a full reload resets it.
let lastListSearch = "";

export function rememberMembersListSearch(search: string) {
  lastListSearch = search;
}

export function membersListHref() {
  return lastListSearch ? `/members?${lastListSearch}` : "/members";
}
