"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Zap } from "lucide-react"
import type { Session } from "@/lib/supabase-types"

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function TokenUsage({ sessions }: { sessions: Session[] }) {
  const totalTokensIn = sessions.reduce((sum, s) => sum + (s.tokens_input || 0), 0)
  const totalTokensOut = sessions.reduce((sum, s) => sum + (s.tokens_output || 0), 0)
  const totalTokens = totalTokensIn + totalTokensOut

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" />
          Token Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums">{formatNumber(totalTokensIn)}</p>
            <p className="text-xs text-muted-foreground mt-1">Input Tokens</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums">{formatNumber(totalTokensOut)}</p>
            <p className="text-xs text-muted-foreground mt-1">Output Tokens</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums">{formatNumber(totalTokens)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Tokens</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
