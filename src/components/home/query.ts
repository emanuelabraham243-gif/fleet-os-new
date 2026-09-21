/** Unwraps a Supabase result. Query errors are thrown so (app)/error.tsx renders. */
export function rows<T>(res: { data: unknown[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T[];
}

export function row<T>(res: { data: unknown; error: { message: string } | null }): T | null {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? null) as T | null;
}
