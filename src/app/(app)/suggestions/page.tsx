import { getAuthProfile } from '@/lib/auth'
import { getMySuggestions, getAllSuggestions } from '@/actions/suggestions'
import { SuggestionsClient } from './client'
import type { Suggestion } from '@/lib/supabase/types'

type SuggestionWithUser = Suggestion & { user_name?: string }

export default async function SuggestionsPage() {
  const profile  = await getAuthProfile()
  const isAdmin  = profile?.role === 'admin'
  const initialItems = await (isAdmin ? getAllSuggestions() : getMySuggestions())

  return (
    <SuggestionsClient
      isAdmin={isAdmin}
      initialShowAll={isAdmin}
      initialItems={initialItems as SuggestionWithUser[]}
    />
  )
}
