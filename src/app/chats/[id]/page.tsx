"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Bot, ChevronLeft } from "lucide-react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import Link from "next/link"
import { useParams } from "next/navigation"

interface TaskMessage {
  id: string
  task_id: string
  parent_message_id: string | null
  role: "user" | "assistant" | "system" | "tool"
  type: string
  content: any
  metadata: any
  sequence_number: number
  created_at: string
  model?: string
  provider?: string
  token_usage?: any
  tasks?: {
    id: string
    agent_slug: string
    status: string
    agent_id: string
    created_at: string
  }
}

export default function ChatDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [message, setMessage] = useState<TaskMessage | null>(null)
  const [thread, setThread] = useState<TaskMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMessage = async () => {
      if (!supabase || !id) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const { data, error } = await supabase
          .from("task_messages")
          .select(
            `
            id,
            task_id,
            parent_message_id,
            role,
            type,
            content,
            metadata,
            sequence_number,
            created_at,
            model,
            provider,
            token_usage,
            tasks(id, agent_slug, status, agent_id, created_at)
          `
          )
          .eq("id", id)
          .single()

        if (error) throw error

        setMessage(data as TaskMessage)

        // Fetch thread if there are parent messages
        let threadMessages: TaskMessage[] = [data as TaskMessage]
        let currentMsg = data

        if (currentMsg?.parent_message_id) {
          let parentId: string | null = currentMsg.parent_message_id
          const visited = new Set<string>()

          while (parentId && !visited.has(parentId)) {
            visited.add(parentId)
            const { data: parentMsg } = await supabase!
              .from("task_messages")
              .select("*")
              .eq("id", parentId)
              .single() as { data: TaskMessage | null }

            if (parentMsg) {
              threadMessages.unshift(parentMsg as TaskMessage)
              parentId = parentMsg.parent_message_id ?? null
            } else {
              break
            }
          }
        }

        setThread(threadMessages)
      } catch (error) {
        console.error("Failed to fetch message:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMessage()
  }, [id])

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  if (!message) {
    return <div className="p-6 text-center text-destructive">Message not found</div>
  }

  const getRoleIcon = (role: string) => {
    return role === "assistant" ? (
      <Bot className="h-5 w-5 text-blue-500" />
    ) : (
      <User className="h-5 w-5 text-gray-500" />
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

  return (
    <div className="p-6 space-y-6">
      {/* Back Link */}
      <Link href="/chats" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to Chats
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {getRoleIcon(message.role)}
            {message.role.charAt(0).toUpperCase() + message.role.slice(1)} Message
          </h1>
          <p className="text-muted-foreground">
            {message.tasks?.agent_slug} · {message.id.slice(0, 8)}
          </p>
        </div>
        <Badge variant={getTypeColor(message.type)}>
          {message.type.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Task Info */}
      {message.tasks && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Task</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-sm">{message.tasks.id.slice(0, 12)}...</p>
              <p className="text-xs text-muted-foreground capitalize">
                {message.tasks.status}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-sm">{message.tasks.agent_slug}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Created</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-sm">
                {new Date(message.created_at).toLocaleDateString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(message.created_at).toLocaleTimeString()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Message Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Message Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-md">
            {typeof message.content === "string" ? (
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            ) : (
              <pre className="overflow-auto max-h-96 text-sm">
                {JSON.stringify(message.content, null, 2)}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metadata & Token Usage */}
      {(message.metadata || message.token_usage || message.model) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {message.metadata && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
                  {JSON.stringify(message.metadata, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {(message.token_usage || message.model) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Model & Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {message.model && (
                  <p>
                    <span className="font-medium">Model:</span> {message.model}
                  </p>
                )}
                {message.provider && (
                  <p>
                    <span className="font-medium">Provider:</span> {message.provider}
                  </p>
                )}
                {message.token_usage && (
                  <div>
                    <p className="font-medium">Tokens:</p>
                    <pre className="bg-muted p-2 rounded text-xs mt-1">
                      {JSON.stringify(message.token_usage, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Thread View */}
      {thread.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Thread ({thread.length} messages)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {thread.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded border ${
                    msg.id === message.id ? "bg-blue-50 border-blue-200" : "bg-muted border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getRoleIcon(msg.role)}
                    <span className="text-xs font-medium capitalize">{msg.role}</span>
                    <Badge variant="outline" className="text-xs">
                      {msg.type.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {typeof msg.content === "string"
                      ? msg.content.slice(0, 50)
                      : JSON.stringify(msg.content).slice(0, 50)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
