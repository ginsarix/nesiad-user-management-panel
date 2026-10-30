import { cookies } from "next/headers";
import {
  columnVisibilityCookieName,
  parseColumnVisibility,
} from "./column-visibility";

/** For pages to pass to their table: the columns this browser shows or hides */
export async function getSavedColumnVisibility(tableId: string) {
  const cookieStore = await cookies();
  // Next decodes cookie values when reading them
  return parseColumnVisibility(
    cookieStore.get(columnVisibilityCookieName(tableId))?.value,
  );
}
