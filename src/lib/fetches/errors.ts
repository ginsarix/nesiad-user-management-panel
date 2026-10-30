/** Throws the API's `{ error }` message, or the fallback if there is none */
export async function throwResponseError(
  res: { json(): Promise<unknown> },
  fallback: string,
): Promise<never> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  throw new Error(body?.error ?? fallback);
}
