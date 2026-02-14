"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Cpu } from "lucide-react"
import type { Agent } from "@/lib/supabase-types"
import { formatDistanceToNow } from "date-fns"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-600 border-green-500/30",
  idle: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  offline: "bg-gray-500/15 text-gray-600 border-gray-500/30",
  error: "bg-red-500/15 text-red-600 border-red-500/30",
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-yellow-500",
  offline: "bg-gray-500",
  error: "bg-red-500",
}

function relativeTime(date: string | null): string {
  if (!date) return "never"
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return "unknown"
  }
}

function AgentCard({ agent }: { agent: Agent }) {
  const status = (agent.status || "offline").toLowerCase()
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.offline
  const dotClass = STATUS_DOT[status] || STATUS_DOT.offline

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate">{agent.name}</p>
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
          {status}
        </Badge>
        {agent.role && (
          <Badge variant="outline" className="text-[10px]">
            {agent.role}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Heartbeat: {relativeTime(agent.last_heartbeat)}
      </p>
    </div>
  )
}

export function AgentFleet({ agents }: { agents: Agent[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" />
          Agent Fleet
        </CardTitle>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No agents configured
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
