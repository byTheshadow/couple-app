import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const ACCOUNT_DOMAIN = import.meta.env.VITE_ACCOUNT_DOMAIN || 'couple.app'
export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null
