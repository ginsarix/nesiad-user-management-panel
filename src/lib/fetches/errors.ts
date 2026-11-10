/** The API's refusal; `field` names the form field it is about, if any */
export class ApiError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.field = field;
  }
}

/** Throws the API's `{ error, field? }`, or the fallback message if there is none */
export async function throwResponseError(
  res: { json(): Promise<unknown> },
  fallback: string,
): Promise<never> {
  const body = (await res.json().catch(() => null)) as {
    error?: unknown;
    field?: unknown;
  } | null;
  throw new ApiError(
    typeof body?.error === "string" ? body.error : fallback,
    typeof body?.field === "string" ? body.field : undefined,
  );
}
