'use client'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'

const Badge3D = dynamic(
  () => import('./Badge3D').then((mod) => mod.Badge3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    ),
  }
)

interface HeroContentProps {
  isLoggedIn: boolean
}

export function HeroContent({ isLoggedIn }: HeroContentProps) {
  return (
    <div className="flex flex-col min-h-[100dvh] w-full bg-background selection:bg-primary/10">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/brief.png" alt="Brief" width={84} height={28} className="h-7 w-auto" />
          </div>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Button asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 pt-16">
        {/* Left: Text */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 md:px-12 lg:px-16 py-12 lg:py-0">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6 text-foreground">
            Give your AI agent
            <br />
            the context it needs.
          </h1>

          <div className="space-y-4 max-w-lg">
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
              Brief ensures your AI coding agent always checks your{' '}
              <span className="text-foreground font-medium">knowledge base</span>{' '}
              before taking action. Stop reinventing the wheel, respect your patterns.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-8">
            <Button size="lg" asChild>
              <Link href={isLoggedIn ? '/dashboard' : '/signup'}>
                {isLoggedIn ? 'Go to Dashboard' : 'Start for free'}
              </Link>
            </Button>
            {!isLoggedIn && (
              <Button variant="ghost" asChild>
                <Link href="/login">Sign in →</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Right: 3D Badge */}
        <div className="w-full lg:w-1/2 relative h-[400px] sm:h-[500px] lg:h-auto bg-gradient-to-br from-background via-muted/50 to-background">
          <Badge3D />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Works with Claude Code, Cursor, Windsurf, Copilot...</p>
          <p className="text-xs text-muted-foreground">Built for hackathon 2025</p>
        </div>
      </footer>
    </div>
  )
}
