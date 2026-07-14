import { createClient } from '@/lib/supabase/server'
import { getMySuggestions } from '@/actions/suggestions'
import { SuggestionsClient } from './client'
import type { Suggestion } from '@/lib/supabase/types'

type SuggestionWithUser = Suggestion & { user_name?: string }

export default async function SuggestionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const initialItems = await getMySuggestions()

  return (
    <SuggestionsClient
      isAdmin={isAdmin}
      initialItems={initialItems as SuggestionWithUser[]}
    />
  )
}
