import { getAuthProfile } from '@/lib/auth'
import { getMySuggestions } from '@/actions/suggestions'
import { SuggestionsClient } from './client'
import type { Suggestion } from '@/lib/supabase/types'

type SuggestionWithUser = Suggestion & { user_name?: string }

export default async function SuggestionsPage() {
  const [profile, initialItems] = await Promise.all([
    getAuthProfile(),
    getMySuggestions(),
  ])

  const isAdmin = profile?.role === 'admin'

  return (
    <SuggestionsClient
      isAdmin={isAdmin}
      initialItems={initialItems as SuggestionWithUser[]}
    />
  )
}
