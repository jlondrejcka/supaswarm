"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, User, Bot } from "lucide-react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import Link from "next/link"

interface TaskMessage {
  id: string
  task_id: string
  role: "user" | "assistant" | "system" | "tool"
  type: string
  content: any
  created_at: string
  model?: string
  provider?: string
  tasks?: { id: string; agent_slug: string; status: string }
}

export default function ChatsPage() {
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "user_message" | "assistant_message" | "tool_call">(
    "all"
  )

  const fetchMessages = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      let query = supabase
        .from("task_messages")
        .select(`
          id,
          task_id,
          role,
          type,
          content,
          created_at,
          model,
          provider,
          tasks(id, agent_slug, status)
        `)

      if (filter !== "all") {
        query = query.eq("type", filter)
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error
      setMessages((data || []) as TaskMessage[])
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  const getRoleIcon = (role: string) => {
    return role === "assistant" ? (
      <Bot className="h-4 w-4 text-blue-500" />
    ) : (
      <User className="h-4 w-4 text-gray-500" />
    )
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      user_message: "outline",
      assistant_message: "default",
      tool_call: "secondary",
      tool_result: "secondary"
    }
    return colors[type] || "outline"
  }

  const getContentPreview = (content: any): string => {
    if (typeof content === "string") return content.slice(0, 100)
    if (content && typeof content === "object") {
      if (content.text) return content.text.slice(0, 100)
      if (content.message) return content.message.slice(0, 100)
      return JSON.stringify(content).slice(0, 100)
    }
    return ""
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">Chats</h1>
            <p className="text-muted-foreground">Task messages and conversations</p>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "user_message", "assistant_message", "tool_call"] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            size="sm"
            className="capitalize"
          >
            {f.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      {/* Messages List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : messages.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">No messages found</p>
            </CardContent>
          </Card>
        ) : (
          messages.map(message => (
            <Card key={message.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getRoleIcon(message.role)}
                      <span className="text-sm font-medium capitalize">{message.role}</span>
                      <Badge variant={getTypeColor(message.type)} className="text-xs">
                        {message.type.replace(/_/g, " ")}
                      </Badge>
                      {message.model && (
                        <span className="text-xs text-muted-foreground">{message.model}</span>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                      {getContentPreview(message.content) || "(Empty message)"}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {message.tasks && (
                        <>
                          <span>Task: {message.tasks.id.slice(0, 8)}...</span>
                          <span className="capitalize">{message.tasks.status}</span>
                          <span>{message.tasks.agent_slug}</span>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(message.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <Link href={`/chats/${message.id}`}>
                      <Button size="sm" variant="default">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
