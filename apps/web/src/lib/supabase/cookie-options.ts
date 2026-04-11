import type { CookieOptions } from "@supabase/ssr";

type NextCompatibleCookieOptions = Omit<CookieOptions, "sameSite"> & {
  sameSite?: "lax" | "strict" | "none";
};

export function toNextCompatibleCookieOptions(
  options: CookieOptions = {}
): NextCompatibleCookieOptions {
  return {
    ...options,
    sameSite: typeof options.sameSite === "boolean" ? undefined : options.sameSite,
  };
}
