"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Session } from "@/lib/supabase-types"
import { RefreshCw, ChevronRight } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setSessions(data || [])
    } catch (error) {
      console.error("Failed to fetch sessions:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      case "idle":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
      case "closed":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
      case "completed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
    }
  }

  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "0"
    return new Intl.NumberFormat().format(num)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">View and monitor active sessions</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSessions}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <div className="flex-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No sessions found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sessions ({sessions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap mb-4">
              <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
                All ({sessions.length})
              </Button>
              {["active", "idle", "closed", "completed"].map((status) => (
                <Button key={status} variant={filter === status ? "default" : "outline"} size="sm" onClick={() => setFilter(status)}>
                  {status} ({sessions.filter(s => s.status === status).length})
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              {(filter === "all" ? sessions : sessions.filter(s => s.status === filter)).map((session) => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  className="flex items-center gap-4 p-4 border rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getStatusBadgeColor(session.status || "closed")}`}
                    >
                      {session.status || "closed"}
                    </span>
                    {session.channel_type && (
                      <Badge variant="outline" className="text-xs">
                        {session.channel_type}
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {session.display_name || "Unnamed Session"}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono text-xs">
                        {session.id.substring(0, 8)}
                      </span>
                      <span>
                        Tokens: {formatNumber(session.tokens_input)} in / {formatNumber(session.tokens_output)} out
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>
                      {session.last_activity_at && (
                        <div>
                          Active: {formatDistanceToNow(new Date(session.last_activity_at), { addSuffix: true })}
                        </div>
                      )}
                      {session.created_at && (
                        <div className="mt-1">
                          Created: {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
