/**
 * Configuration du site
 */

export const siteConfig = {
  name: "Brief",
  description: "Give your AI agent the context it needs",
  url: "https://brief.app",

  // Links
  links: {
    github: "https://github.com/marlowetal653/briefkit",
    docs: "/docs",
  },

  // Auth
  auth: {
    callbackUrl: "/auth/callback",
    loginUrl: "/login",
    signupUrl: "/signup",
    onboardingUrl: "/onboarding",
    dashboardUrl: "/dashboard",
  },

  // Navigation
  nav: {
    main: [
      { label: "Documents", href: "/dashboard" },
      { label: "Tokens", href: "/savings" },
      { label: "Settings", href: "/settings" },
    ],
  },

  // Metadata
  metadata: {
    title: {
      default: "Brief - AI Agent Context",
      template: "%s | Brief",
    },
    keywords: [
      "AI",
      "agent",
      "context",
      "knowledge base",
      "RAG",
      "Claude",
      "Cursor",
      "Copilot",
    ],
  },
} as const;

export type SiteConfig = typeof siteConfig;
