// Supabase client. Deliberately optional: if the two env vars are missing the
// app still runs in full guest mode, which keeps `npm run dev` working for a
// contributor who has not set up a project yet and keeps the GitHub Pages
// build from failing.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Google sign-in comes back with the session in the URL fragment.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

/**
 * Where OAuth should return to. Uses Vite's base so the redirect works both on
 * localhost and under the /keyboard-cats/ path on GitHub Pages.
 */
export function authRedirectUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}
