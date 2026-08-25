/**
 * Admin identity — the single source of truth for who is allowed into /admin.
 *
 * Client-side gating alone is not a security boundary; the real enforcement
 * has to be Supabase Row-Level Security policies keyed on `auth.jwt()->>email`
 * (or a `role` column on a `user_roles` table). This module ensures the UI
 * matches that boundary — an authenticated non-admin user can never see admin
 * pages, request a reset link, or complete a reset flow.
 *
 * When you migrate to a proper `user_roles` table, replace `isAdminEmail`
 * with a query against that table and keep the rest of the surface unchanged.
 */

export const ADMIN_EMAIL = "yassinsinif4@gmail.com";

/** True when this email is the site owner and may access /admin. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}
