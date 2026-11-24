import { RELEASE_VERSIONS } from "@/lib/release-notes";
import { requireSession } from "@/lib/session";
import { ReleaseNotes } from "./release-notes";

// The notes ship in the bundle (src/lib/release-notes.ts), so there's
// nothing to fetch or prefetch
export default async function ReleaseNotesPage() {
  await requireSession();

  return <ReleaseNotes versions={RELEASE_VERSIONS} />;
}
