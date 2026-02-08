"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import { RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ChannelConnection {
  id: string
  channel_type: string
  channel_id: string
  display_name: string | null
  status: string
  agent_id?: string | null
  created_at: string
  updated_at?: string
  last_event_at?: string | null
  message_count?: number
  error_message?: string | null
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelConnection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChannels()
  }, [])

  async function fetchChannels() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const { data: channelsData, error: channelsError } = await supabase
        .from("channel_connections" as any)
        .select("*")
        .order("created_at", { ascending: false })

      if (channelsError) throw channelsError

      // Fetch agent_id from most recent active session for each channel
      const channelsWithAgents = await Promise.all(
        (channelsData || []).map(async (channel: any) => {
          const { data: sessionData } = await supabase!
            .from("sessions")
            .select("agent_id")
            .eq("channel_type", channel.channel_type)
            .eq("channel_id", channel.channel_id)
            .in("status", ["active", "idle"])
            .order("last_activity_at", { ascending: false })
            .limit(1)
            .single()

          return {
            ...channel,
            agent_id: sessionData?.agent_id || null,
          }
        })
      )

      setChannels(channelsWithAgents)
    } catch (error) {
      console.error("Failed to fetch channels:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const getStatusColor = (status: string) => {
    if (status === "active") {
      return "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400 dark:bg-green-500/20"
    }
    return "bg-gray-500/10 text-gray-700 border-gray-500/20 dark:text-gray-400 dark:bg-gray-500/20"
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Channels</h1>
          <p className="text-muted-foreground">Monitor channel connections and their status</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchChannels}>
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
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <div className="flex-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No channel connections found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Channel Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Channel Type</p>
                      <p className="font-medium capitalize">{channel.channel_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Channel ID</p>
                      <p className="font-mono text-sm truncate">{channel.channel_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Channel Name</p>
                      <p className="font-medium">{channel.display_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge className={getStatusColor(channel.status)}>
                        {channel.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Agent ID</p>
                      <p className="font-mono text-sm">{channel.agent_id ? channel.agent_id.slice(0, 8) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created At</p>
                      <p className="text-sm">
                        {channel.created_at && formatDistanceToNow(new Date(channel.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
