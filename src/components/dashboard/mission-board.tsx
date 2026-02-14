"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Inbox, UserCheck, Play, Eye, CheckCircle2, ShieldAlert } from "lucide-react"
import type { Task } from "@/lib/supabase-types"

const MISSION_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  inbox: { label: "Inbox", color: "text-gray-600", bg: "bg-gray-500" },
  assigned: { label: "Assigned", color: "text-blue-600", bg: "bg-blue-500" },
  in_progress: { label: "In Progress", color: "text-amber-600", bg: "bg-amber-500" },
  review: { label: "Review", color: "text-purple-600", bg: "bg-purple-500" },
  done: { label: "Done", color: "text-green-600", bg: "bg-green-500" },
  blocked: { label: "Blocked", color: "text-red-600", bg: "bg-red-500" },
}

function MissionIcon({ status }: { status: string }) {
  const iconClass = "h-3.5 w-3.5"
  switch (status) {
    case "inbox":
      return <Inbox className={`${iconClass} text-gray-500`} />
    case "assigned":
      return <UserCheck className={`${iconClass} text-blue-500`} />
    case "in_progress":
      return <Play className={`${iconClass} text-amber-500`} />
    case "review":
      return <Eye className={`${iconClass} text-purple-500`} />
    case "done":
      return <CheckCircle2 className={`${iconClass} text-green-500`} />
    case "blocked":
      return <ShieldAlert className={`${iconClass} text-red-500`} />
    default:
      return <Activity className={`${iconClass} text-gray-400`} />
  }
}

export function MissionBoard({ tasks }: { tasks: Task[] }) {
  // Mission status counts
  const missionCounts: Record<string, number> = {}
  for (const key of Object.keys(MISSION_STATUS_CONFIG)) {
    missionCounts[key] = tasks.filter((t) => t.mission_status === key).length
  }
  const totalMissionTasks = Object.values(missionCounts).reduce((a, b) => a + b, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Mission Board
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalMissionTasks === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No missions tracked yet
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(MISSION_STATUS_CONFIG).map(([key, cfg]) => {
              const count = missionCounts[key] || 0
              const pct = totalMissionTasks > 0 ? (count / totalMissionTasks) * 100 : 0
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <MissionIcon status={key} />
                      <span className={cfg.color}>{cfg.label}</span>
                    </div>
                    <span className="font-medium tabular-nums">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${cfg.bg} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
