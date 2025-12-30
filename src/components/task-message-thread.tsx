"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { TaskMessage, MessageType } from "@/lib/supabase-types"
import { 
  User, 
  Bot, 
  Brain, 
  Wrench, 
  Sparkles, 
  GitBranch, 
  AlertCircle, 
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ArrowRightLeft
} from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface TaskMessageThreadProps {
  taskId: string
  variant?: "log" | "chat"
}

interface MessageGroup {
  type: MessageType
  messages: TaskMessage[]
  isExpanded: boolean
}

const messageIcons: Record<MessageType, typeof User> = {
  user_message: User,
  assistant_message: Bot,
  thinking: Brain,
  tool_call: Wrench,
  tool_result: Wrench,
  skill_load: Sparkles,
  subtask_created: GitBranch,
  error: AlertCircle,
  status_change: RefreshCw,
  handoff: ArrowRightLeft,
}

const messageColors: Record<MessageType, string> = {
  user_message: "text-blue-500",
  assistant_message: "text-green-500",
  thinking: "text-amber-500",
  tool_call: "text-purple-500",
  tool_result: "text-purple-400",
  skill_load: "text-pink-500",
  subtask_created: "text-cyan-500",
  error: "text-red-500",
  status_change: "text-muted-foreground",
  handoff: "text-teal-500",
}

const messageBgColors: Record<MessageType, string> = {
  user_message: "bg-blue-500/10",
  assistant_message: "bg-green-500/10",
  thinking: "bg-amber-500/10",
  tool_call: "bg-purple-500/10",
  tool_result: "bg-purple-500/5",
  skill_load: "bg-pink-500/10",
  subtask_created: "bg-cyan-500/10",
  error: "bg-red-500/10",
  status_change: "bg-muted/50",
  handoff: "bg-teal-500/10",
}

const messageLabels: Record<MessageType, string> = {
  user_message: "User",
  assistant_message: "Assistant",
  thinking: "Thinking",
  tool_call: "Tool Call",
  tool_result: "Tool Result",
  skill_load: "Skill Loaded",
  subtask_created: "Subtask",
  error: "Error",
  status_change: "Status",
  handoff: "Handoff",
}

export function TaskMessageThread({ taskId, variant = "log" }: TaskMessageThreadProps) {
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchMessages()
  }, [taskId])

  useEffect(() => {
    if (!supabase || !taskId) return

    const client = supabase
    const channel = client
      .channel(`task-messages-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_messages',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as TaskMessage].sort((a, b) => a.sequence_number - b.sequence_number))
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [taskId])

  async function fetchMessages() {
    if (!supabase || !taskId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("task_messages" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("sequence_number", { ascending: true })

      if (error) throw error
      setMessages((data || []) as unknown as TaskMessage[])
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    } finally {
      setLoading(false)
    }
  }

  const toggleGroup = (index: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No messages yet</p>
      </div>
    )
  }

  if (variant === "log") {
    return <LogView messages={messages} />
  }

  return (
    <ChatView 
      messages={messages} 
      expandedGroups={expandedGroups} 
      toggleGroup={toggleGroup} 
    />
  )
}

function LogView({ messages }: { messages: TaskMessage[] }) {
  return (
    <div className="font-mono text-xs space-y-0.5 bg-muted/30 rounded-md p-3 max-h-[600px] overflow-y-auto">
      {messages.map((msg, i) => {
        const Icon = messageIcons[msg.type]
        const content = msg.content as { text?: string; message?: string; status?: string; error?: string; skill_name?: string }
        const displayText = content.text || content.message || content.status || content.error || content.skill_name || JSON.stringify(content)
        
        return (
          <div 
            key={msg.id} 
            className={cn(
              "flex items-start gap-2 py-1 px-2 rounded",
              messageBgColors[msg.type]
            )}
            data-testid={`log-message-${i}`}
          >
            <span className="text-muted-foreground w-16 shrink-0">
              {msg.created_at && format(new Date(msg.created_at), "HH:mm:ss")}
            </span>
            <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", messageColors[msg.type])} />
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
              {messageLabels[msg.type]}
            </Badge>
            <span className={cn("flex-1 break-words", msg.type === 'error' && "text-destructive")}>
              {displayText}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChatView({ 
  messages, 
  expandedGroups, 
  toggleGroup 
}: { 
  messages: TaskMessage[]
  expandedGroups: Set<number>
  toggleGroup: (index: number) => void
}) {
  const groupedMessages = groupMessagesByType(messages)

  return (
    <div className="space-y-3">
      {groupedMessages.map((group, groupIndex) => {
        const isCollapsible = ['thinking', 'tool_call', 'tool_result', 'skill_load', 'status_change'].includes(group.type)
        const isExpanded = expandedGroups.has(groupIndex)
        const Icon = messageIcons[group.type]
        
        if (group.type === 'user_message') {
          return (
            <div key={groupIndex} className="flex justify-end">
              <div className="max-w-[80%] bg-primary text-primary-foreground rounded-lg px-4 py-2">
                {group.messages.map((msg, i) => {
                  const content = msg.content as { text?: string }
                  return (
                    <p key={i} className="text-sm" data-testid={`chat-user-message-${groupIndex}`}>
                      {content.text}
                    </p>
                  )
                })}
              </div>
            </div>
          )
        }

        if (group.type === 'assistant_message') {
          return (
            <div key={groupIndex} className="flex justify-start">
              <div className="max-w-[80%] bg-muted rounded-lg px-4 py-2">
                {group.messages.map((msg, i) => {
                  const content = msg.content as { text?: string }
                  return (
                    <p key={i} className="text-sm whitespace-pre-wrap" data-testid={`chat-assistant-message-${groupIndex}`}>
                      {content.text}
                    </p>
                  )
                })}
              </div>
            </div>
          )
        }

        if (group.type === 'error') {
          return (
            <div key={groupIndex} className="flex justify-start">
              <div className="max-w-[80%] bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Error</span>
                </div>
                {group.messages.map((msg, i) => {
                  const content = msg.content as { error?: string }
                  return (
                    <p key={i} className="text-sm text-destructive" data-testid={`chat-error-${groupIndex}`}>
                      {content.error}
                    </p>
                  )
                })}
              </div>
            </div>
          )
        }

        if (isCollapsible) {
          return (
            <div key={groupIndex} className="flex justify-start">
              <button
                onClick={() => toggleGroup(groupIndex)}
                className={cn(
                  "flex items-center gap-2 text-sm px-3 py-1.5 rounded-md transition-colors",
                  messageBgColors[group.type],
                  "hover-elevate"
                )}
                data-testid={`chat-collapse-${group.type}-${groupIndex}`}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <Icon className={cn("h-3 w-3", messageColors[group.type])} />
                <span className={messageColors[group.type]}>
                  {messageLabels[group.type]}
                </span>
                <Badge variant="secondary" className="text-[10px] ml-1">
                  {group.messages.length}
                </Badge>
              </button>
              
              {isExpanded && (
                <div className="mt-2 ml-6 space-y-1">
                  {group.messages.map((msg, i) => {
                    const content = msg.content as { text?: string; skill_name?: string; status?: string }
                    const displayText = content.text || content.skill_name || content.status || JSON.stringify(content)
                    return (
                      <div 
                        key={i} 
                        className={cn(
                          "text-xs px-3 py-1.5 rounded",
                          messageBgColors[group.type]
                        )}
                      >
                        <span className="text-muted-foreground">{displayText}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

function groupMessagesByType(messages: TaskMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const msg of messages) {
    if (!currentGroup || currentGroup.type !== msg.type) {
      if (currentGroup) {
        groups.push(currentGroup)
      }
      currentGroup = {
        type: msg.type,
        messages: [msg],
        isExpanded: false,
      }
    } else {
      currentGroup.messages.push(msg)
    }
  }

  if (currentGroup) {
    groups.push(currentGroup)
  }

  return groups
}
