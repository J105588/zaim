import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env file.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

export type Category = {
  id: string
  name_ja: string
  name_zh: string
  icon: string
  created_at: string
}

export type Transaction = {
  id: string
  type: 'income' | 'expense'
  category_id: string | null
  amount: number
  created_at: string
  category?: Category -- Joined category data
}
