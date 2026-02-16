import { createClient } from '@/lib/supabase/server'
import { HeroContent } from './HeroContent'

export async function Hero() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <HeroContent isLoggedIn={!!user} />
}
