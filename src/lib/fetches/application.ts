import { displayToIso } from "../dates";
import type { ApplicationFormValues } from "../zod-schemas/application";

const FALLBACK_MESSAGE =
  "Başvuru gönderilemedi. Dosya boyutlarını kontrol edip tekrar deneyin.";
const NETWORK_MESSAGE = "Bağlantı kurulamadı. Lütfen tekrar deneyin.";

/** The API's refusal; `field` names the form field it is about, if any */
export class ApplicationError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ApplicationError";
    this.field = field;
  }
}

const FILE_FIELDS = ["logo", "identityDocument", "activityDocument"] as const;

/** Sends the public membership application as multipart form data */
export async function submitApplication(values: ApplicationFormValues) {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if ((FILE_FIELDS as readonly string[]).includes(key)) continue;
    if (key === "birthDate") body.append(key, displayToIso(String(value)));
    else if (typeof value === "boolean") body.append(key, String(value));
    else body.append(key, String(value ?? ""));
  }
  for (const key of FILE_FIELDS) {
    const file = values[key];
    if (file) body.append(key, file);
  }

  let res: Response;
  try {
    res = await fetch("/api/applications", { method: "POST", body });
  } catch {
    throw new ApplicationError(NETWORK_MESSAGE);
  }
  if (res.ok) return;

  // front servers and malformed bodies can answer with something other than JSON
  const data = (await res.json().catch(() => null)) as {
    error?: unknown;
    field?: unknown;
  } | null;
  throw new ApplicationError(
    typeof data?.error === "string" ? data.error : FALLBACK_MESSAGE,
    typeof data?.field === "string" ? data.field : undefined,
  );
}
