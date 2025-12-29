"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import type { Task, Agent } from "@/lib/supabase-types"
import { Bot, Send, Loader2, MessageSquare, History, ArrowLeft, ChevronRight, ChevronDown, Brain, Wrench, Sparkles, GitBranch, AlertCircle, RefreshCw } from "lucide-react"
import type { TaskMessage, MessageType } from "@/lib/supabase-types"
import { formatDistanceToNow } from "date-fns"
import { StatusBadge } from "@/components/status-badge"
import type { TaskStatus } from "@/lib/supabase-types"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  status?: string
  taskId?: string
  taskMessages?: TaskMessage[]
  expandedSections?: Set<string>
}

const messageTypeIcons: Record<MessageType, typeof Brain> = {
  user_message: Bot,
  assistant_message: Bot,
  thinking: Brain,
  tool_call: Wrench,
  tool_result: Wrench,
  skill_load: Sparkles,
  subtask_created: GitBranch,
  error: AlertCircle,
  status_change: RefreshCw,
}

const messageTypeColors: Record<MessageType, string> = {
  user_message: "text-blue-500",
  assistant_message: "text-green-500",
  thinking: "text-amber-500",
  tool_call: "text-purple-500",
  tool_result: "text-purple-400",
  skill_load: "text-pink-500",
  subtask_created: "text-cyan-500",
  error: "text-red-500",
  status_change: "text-muted-foreground",
}

const messageTypeLabels: Record<MessageType, string> = {
  user_message: "User",
  assistant_message: "Response",
  thinking: "Thinking",
  tool_call: "Tool Call",
  tool_result: "Tool Result",
  skill_load: "Skill",
  subtask_created: "Subtask",
  error: "Error",
  status_change: "Status",
}

interface ChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [defaultAgent, setDefaultAgent] = useState<Agent | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [chatHistory, setChatHistory] = useState<Task[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  useEffect(() => {
    if (open) {
      fetchDefaultAgent()
    }
  }, [open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!supabase || !open) return

    const client = supabase
    
    const channel = client
      .channel('task-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
        },
        (payload) => {
          const updatedTask = payload.new as Task
          const output = updatedTask.output as { response?: string; error?: string }
          
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.taskId === updatedTask.id) {
                if (updatedTask.status === 'completed' && output?.response) {
                  return {
                    ...msg,
                    status: 'completed',
                    content: output.response,
                  }
                } else if (updatedTask.status === 'failed') {
                  return {
                    ...msg,
                    status: 'failed',
                    content: output?.error || 'Task failed',
                  }
                }
                return { ...msg, status: updatedTask.status }
              }
              return msg
            })
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_messages',
        },
        (payload) => {
          const newMessage = payload.new as TaskMessage
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.taskId === newMessage.task_id) {
                const existingMessages = msg.taskMessages || []
                return {
                  ...msg,
                  taskMessages: [...existingMessages, newMessage].sort((a, b) => a.sequence_number - b.sequence_number),
                }
              }
              return msg
            })
          )
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [open])

  async function fetchTaskMessages(taskId: string): Promise<TaskMessage[]> {
    if (!supabase) return []
    
    const { data, error } = await supabase
      .from("task_messages" as any)
      .select("*")
      .eq("task_id", taskId)
      .order("sequence_number", { ascending: true })

    if (error) {
      console.error("Failed to fetch task messages:", error)
      return []
    }
    
    return (data || []) as unknown as TaskMessage[]
  }

  async function fetchDefaultAgent() {
    if (!supabase) return

    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("is_default", true)
      .single()

    setDefaultAgent(data)
  }

  async function fetchChatHistory() {
    if (!supabase) return

    setLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .is("master_task_id", null)
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) throw error
      setChatHistory(data || [])
    } catch (error) {
      console.error("Failed to fetch chat history:", error)
    } finally {
      setLoadingHistory(false)
    }
  }

  function handleShowHistory() {
    setShowHistory(true)
    fetchChatHistory()
  }

  async function handleSelectChat(task: Task) {
    const input = task.input as { message?: string }
    const output = task.output as { response?: string; error?: string }
    
    const taskMessages = await fetchTaskMessages(task.id)
    
    const newMessages: Message[] = []
    
    if (input?.message) {
      newMessages.push({
        id: `user-${task.id}`,
        role: "user",
        content: input.message,
      })
    }
    
    if (output?.response || output?.error) {
      newMessages.push({
        id: `assistant-${task.id}`,
        role: "assistant",
        content: output.response || output.error || "",
        status: task.status,
        taskId: task.id,
        taskMessages: taskMessages,
      })
    } else if (task.status !== 'completed' && task.status !== 'failed') {
      newMessages.push({
        id: `pending-${task.id}`,
        role: "assistant",
        content: "Processing...",
        status: task.status,
        taskId: task.id,
        taskMessages: taskMessages,
      })
    }
    
    setMessages(newMessages)
    setShowHistory(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending || !supabase) return

    const userMessage = input.trim()
    setInput("")
    setSending(true)

    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: userMessage },
    ])

    try {
      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          agent_id: defaultAgent?.id || null,
          agent_slug: defaultAgent?.slug || null,
          status: "pending",
          input: { message: userMessage },
        })
        .select()
        .single()

      if (error) throw error

      setMessages((prev) => [
        ...prev,
        {
          id: `pending-${task.id}`,
          role: "assistant",
          content: "Processing...",
          status: "pending",
          taskId: task.id,
          taskMessages: [],
        },
      ])

      setTimeout(async () => {
        const taskMsgs = await fetchTaskMessages(task.id)
        if (taskMsgs.length > 0) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.taskId === task.id
                ? { ...msg, taskMessages: taskMsgs }
                : msg
            )
          )
        }
      }, 1000)
    } catch (error) {
      console.error("Failed to create task:", error)
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Failed to send message. Please try again.",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  if (!isSupabaseConfigured) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[600px] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between gap-2">
            {showHistory ? (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowHistory(false)}
                  data-testid="button-back-to-chat"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle className="flex-1">Chat History</DialogTitle>
              </>
            ) : (
              <>
                <DialogTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  AI Agent Chat
                </DialogTitle>
                <div className="flex items-center gap-2">
                  {defaultAgent && (
                    <Badge variant="outline" className="gap-1">
                      {defaultAgent.name}
                    </Badge>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={handleShowHistory}
                    data-testid="button-chat-history"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
          {!showHistory && !defaultAgent && (
            <p className="text-sm text-muted-foreground">
              No default agent set. Go to Agents page to set one.
            </p>
          )}
        </DialogHeader>

        {showHistory ? (
          <ScrollArea className="flex-1 p-4">
            {loadingHistory ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : chatHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <History className="h-12 w-12 mb-4 opacity-50" />
                <p>No chat history yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {chatHistory.map((task) => {
                  const taskInput = task.input as { message?: string }
                  return (
                    <div
                      key={task.id}
                      className="p-3 rounded-md bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => handleSelectChat(task)}
                      data-testid={`history-item-${task.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <StatusBadge status={task.status as TaskStatus} />
                        <span className="text-xs text-muted-foreground">
                          {task.created_at && formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">
                        {taskInput?.message || "No message"}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        ) : (
          <>
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                  <p>Start a conversation with the AI agent.</p>
                  <p className="text-sm">Your message will create a task for the agent to process.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div key={msg.id}>
                      <div
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {msg.status && msg.status !== "completed" && (
                            <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {msg.status}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {msg.role === "assistant" && msg.taskMessages && msg.taskMessages.length > 0 && (
                        <CollapsibleChainOfThought 
                          taskMessages={msg.taskMessages}
                          messageId={msg.id}
                          expandedSections={expandedSections}
                          toggleSection={toggleSection}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <form onSubmit={handleSubmit} className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={defaultAgent ? "Type your message..." : "Set a default agent first"}
                  disabled={sending || !defaultAgent}
                  data-testid="input-chat-message"
                />
                <Button type="submit" disabled={sending || !input.trim() || !defaultAgent} data-testid="button-send-message">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface CollapsibleChainOfThoughtProps {
  taskMessages: TaskMessage[]
  messageId: string
  expandedSections: Set<string>
  toggleSection: (sectionId: string) => void
}

function CollapsibleChainOfThought({ 
  taskMessages, 
  messageId, 
  expandedSections, 
  toggleSection 
}: CollapsibleChainOfThoughtProps) {
  const groupedMessages = groupTaskMessagesByType(taskMessages)
  
  if (groupedMessages.length === 0) return null

  return (
    <div className="mt-2 ml-4 space-y-1">
      {groupedMessages.map((group, groupIndex) => {
        const sectionId = `${messageId}-${group.type}-${groupIndex}`
        const isExpanded = expandedSections.has(sectionId)
        const Icon = messageTypeIcons[group.type]
        const colorClass = messageTypeColors[group.type]
        const label = messageTypeLabels[group.type]
        
        if (group.type === 'user_message' || group.type === 'assistant_message') {
          return null
        }

        return (
          <div key={sectionId}>
            <button
              onClick={() => toggleSection(sectionId)}
              className="flex items-center gap-2 text-xs px-2 py-1 rounded hover-elevate transition-colors w-full text-left"
              data-testid={`toggle-${group.type}-${groupIndex}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <Icon className={`h-3 w-3 shrink-0 ${colorClass}`} />
              <span className={colorClass}>{label}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {group.messages.length}
              </Badge>
            </button>
            
            {isExpanded && (
              <div className="ml-5 mt-1 space-y-1">
                {group.messages.map((msg, i) => {
                  const content = msg.content as { text?: string; skill_name?: string; status?: string; error?: string; message?: string }
                  const displayText = content.text || content.skill_name || content.status || content.error || content.message || JSON.stringify(content)
                  
                  return (
                    <div 
                      key={i}
                      className="text-xs px-2 py-1 rounded bg-muted/50 text-muted-foreground"
                    >
                      {displayText}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface MessageGroup {
  type: MessageType
  messages: TaskMessage[]
}

function groupTaskMessagesByType(messages: TaskMessage[]): MessageGroup[] {
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

export function ChatButton() {
  const [open, setOpen] = useState(false)

  if (!isSupabaseConfigured) {
    return null
  }

  return (
    <>
      <Button
        size="icon"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="button-open-chat"
      >
        <Bot className="h-4 w-4" />
      </Button>
      <ChatDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
