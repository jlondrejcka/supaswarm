import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { Sidebar, SidebarTrigger } from "@/components/sidebar"
import { ChatButton } from "@/components/chat-dialog"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SupaSwarm - Multi-Agent Orchestration Platform",
  description: "Supabase-native multi-agent orchestration with real-time observability",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="flex h-screen w-full">
            <Sidebar />
            <div className="flex flex-1 flex-col">
              <header className="flex h-14 items-center justify-between gap-4 border-b px-4">
                <SidebarTrigger />
                <ChatButton />
              </header>
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
