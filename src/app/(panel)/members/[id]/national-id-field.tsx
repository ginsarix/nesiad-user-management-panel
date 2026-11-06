"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getMemberNationalId } from "@/lib/fetches/member";

/**
 * The masked TC number with a Göster button. The full number is fetched on
 * click and kept in local state only, never in the query cache.
 */
export function NationalIdField({
  memberId,
  masked,
}: {
  memberId: number;
  masked: string;
}) {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      setFull(await getMemberNationalId(memberId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "TC Kimlik No alınamadı");
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">{full ?? masked}</span>
      {full === null && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={loading}
          onClick={reveal}
        >
          {loading ? "Yükleniyor…" : "Göster"}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
