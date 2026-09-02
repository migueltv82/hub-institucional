import { createClient } from '@supabase/supabase-js'
import {
  clearLegacySupabaseAuthStorage,
  getEffectiveAuthStorageKey,
  getSupabaseAuthStorage,
} from './authStorage.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

clearLegacySupabaseAuthStorage()

const supabaseAuthStorage = getSupabaseAuthStorage()

// Cada pestana/ventana puede estar atada a su propio slot de sesion (ver
// authStorage.js). Sin slot, esto es identico a la clave historica.
const supabaseAuthStorageKey = getEffectiveAuthStorageKey()

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: supabaseAuthStorageKey,
        ...(supabaseAuthStorage ? { storage: supabaseAuthStorage } : {}),
      },
    })
  : null
