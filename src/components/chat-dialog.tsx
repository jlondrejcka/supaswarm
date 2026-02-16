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
import { Bot, Send, Loader2, MessageSquare, History, ArrowLeft, ChevronRight, ChevronDown, Brain, Wrench, Sparkles, GitBranch, AlertCircle, RefreshCw, Plus, ArrowRightLeft } from "lucide-react"
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
  handoff: ArrowRightLeft,
  delegation_start: ArrowRightLeft,
  delegation_complete: ArrowRightLeft,
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
  handoff: "text-teal-500",
  delegation_start: "text-indigo-500",
  delegation_complete: "text-indigo-400",
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
  handoff: "Handoff",
  delegation_start: "Delegating",
  delegation_complete: "Result",
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
  const [chatHistory, setChatHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const [conversationContext, setConversationContext] = useState<{
    sessionId: string | null
    lastTaskId: string | null
  }>({ sessionId: null, lastTaskId: null })

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
          table: 'tasks',
        },
        async (payload) => {
          const newTask = payload.new as Task
          // Check if this task belongs to our current conversation (handoff scenario)
          if (newTask.session_id && newTask.session_id === conversationContext.sessionId) {
            // Handoff: replace the last pending/running assistant message
            // instead of adding a duplicate "Processing..." entry
            setMessages((prev) => {
              // If this task was already added by handleSubmit, skip
              if (prev.some((m) => m.taskId === newTask.id)) return prev

              // Find the last assistant message that is still processing
              const lastPendingIdx = [...prev].reverse().findIndex(
                (m) => m.role === "assistant" && m.status && !["completed", "failed"].includes(m.status)
              )
              if (lastPendingIdx !== -1) {
                const actualIdx = prev.length - 1 - lastPendingIdx
                const updated = [...prev]
                // Swap taskId to the handoff task but keep accumulated chain-of-thought
                updated[actualIdx] = {
                  ...updated[actualIdx],
                  taskId: newTask.id,
                  content: "Processing...",
                  status: newTask.status,
                }
                return updated
              }
              // No pending message found — this is a new turn, add it
              return [
                ...prev,
                {
                  id: `pending-${newTask.id}`,
                  role: "assistant",
                  content: "Processing...",
                  status: newTask.status,
                  taskId: newTask.id,
                  taskMessages: [],
                },
              ]
            })
            // Update lastTaskId to track the new task
            setConversationContext((prev) => ({
              ...prev,
              lastTaskId: newTask.id,
            }))
          }
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
  }, [open, conversationContext.sessionId])

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
        .from("sessions")
        .select("*")
        .eq("channel_type", "webchat")
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

  function handleNewChat() {
    setMessages([])
    setConversationContext({ sessionId: null, lastTaskId: null })
    setShowHistory(false)
  }

  async function handleSelectChat(session: any) {
    if (!supabase) return
    
    const { data: conversationTasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
    
    if (error) {
      console.error("Failed to load conversation:", error)
      return
    }
    
    const allTasks = conversationTasks || []
    const newMessages: Message[] = []
    let lastTaskId: string | null = null
    
    for (const t of allTasks) {
      const taskInput = t.input as { message?: string }
      const taskOutput = t.output as { response?: string; error?: string }
      const taskMsgs = await fetchTaskMessages(t.id)
      
      if (taskInput?.message) {
        newMessages.push({
          id: `user-${t.id}`,
          role: "user",
          content: taskInput.message,
        })
      }
      
      if (taskOutput?.response || taskOutput?.error) {
        newMessages.push({
          id: `assistant-${t.id}`,
          role: "assistant",
          content: taskOutput.response || taskOutput.error || "",
          status: t.status,
          taskId: t.id,
          taskMessages: taskMsgs,
        })
      } else if (t.status !== 'completed' && t.status !== 'failed') {
        newMessages.push({
          id: `pending-${t.id}`,
          role: "assistant",
          content: "Processing...",
          status: t.status,
          taskId: t.id,
          taskMessages: taskMsgs,
        })
      }
      
      lastTaskId = t.id
    }
    
    setConversationContext({
      sessionId: session.id,
      lastTaskId: lastTaskId,
    })
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
      let sessionId = conversationContext.sessionId
      
      // Create session if new conversation
      if (!sessionId) {
        const { data: session, error: sessionError } = await supabase
          .from("sessions")
          .insert({
            agent_id: defaultAgent?.id || null,
            channel_type: "webchat",
            display_name: `Webchat: ${new Date().toLocaleString()}`,
            status: "active",
          })
          .select()
          .single()
        
        if (sessionError) throw sessionError
        sessionId = session.id
      }
      
      const taskData: Record<string, unknown> = {
        agent_id: defaultAgent?.id || null,
        agent_slug: defaultAgent?.slug || null,
        status: "pending",
        input: { message: userMessage },
        session_id: sessionId,
      }
      
      if (conversationContext.lastTaskId) {
        taskData.parent_id = conversationContext.lastTaskId
      }
      
      const { data: task, error } = await supabase
        .from("tasks")
        .insert(taskData)
        .select()
        .single()

      if (error) throw error

      setConversationContext({
        sessionId: sessionId,
        lastTaskId: task.id,
      })

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

      // Check task status before processing
      // Only process if task is still pending (not already processed)
      const { data: taskCheck, error: checkError } = await supabase
        .from("tasks")
        .select("status")
        .eq("id", task.id)
        .single()

      if (checkError) {
        console.error('Failed to check task status:', checkError)
      }

      // Only invoke if task is still pending
      if (taskCheck && (taskCheck.status === "pending" || taskCheck.status === "pending_subtask")) {
        // Invoke local task processing endpoint (replaces remote edge function)
        try {
          const res = await fetch('/api/process-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: task.id }),
          })
          
          if (!res.ok) {
            console.error('Process task error:', await res.text())
          }
        } catch (processError) {
          console.error('Failed to process task:', processError)
        }
      } else {
        console.log('Task already processed, skipping', {
          task_id: task.id,
          status: taskCheck?.status,
        })
      }

      // Fetch task messages after a delay to allow processing
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
      }, 2000)
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
                  {conversationContext.sessionId && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={handleNewChat}
                      data-testid="button-new-chat"
                      title="New Chat"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
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
                {chatHistory.map((session) => {
                  return (
                    <div
                      key={session.id}
                      className="p-3 rounded-md bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => handleSelectChat(session)}
                      data-testid={`history-item-${session.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="outline">{session.channel_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {session.created_at && formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">
                        {session.display_name || "Untitled session"}
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
                      {msg.role === "user" ? (
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-lg px-3 py-2 bg-primary text-primary-foreground">
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-start">
                          <div className="max-w-[85%] space-y-1">
                            {/* Chain of thought summary — above the response */}
                            {msg.taskMessages && msg.taskMessages.length > 0 && (
                              <ChainOfThoughtSummary
                                taskMessages={msg.taskMessages}
                                messageId={msg.id}
                                expandedSections={expandedSections}
                                toggleSection={toggleSection}
                              />
                            )}
                            {/* Agent response bubble */}
                            <div className="rounded-lg px-3 py-2 bg-muted">
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              {msg.status && msg.status !== "completed" && (
                                <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {msg.status}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
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

interface ChainOfThoughtSummaryProps {
  taskMessages: TaskMessage[]
  messageId: string
  expandedSections: Set<string>
  toggleSection: (sectionId: string) => void
}

function ChainOfThoughtSummary({
  taskMessages,
  messageId,
  expandedSections,
  toggleSection,
}: ChainOfThoughtSummaryProps) {
  const groupedMessages = groupTaskMessagesByType(taskMessages)
  // Filter out user/assistant messages — those are shown as bubbles
  const actionGroups = groupedMessages.filter(
    (g) => g.type !== "user_message" && g.type !== "assistant_message"
  )
  if (actionGroups.length === 0) return null

  const summaryId = `${messageId}-cot-summary`
  const isExpanded = expandedSections.has(summaryId)

  // Build ordered icon sequence (deduplicated consecutive types)
  const iconSequence: { type: MessageType; count: number }[] = []
  for (const group of actionGroups) {
    iconSequence.push({ type: group.type, count: group.messages.length })
  }

  return (
    <div className="mb-1">
      {/* Compact icon summary bar */}
      <button
        onClick={() => toggleSection(summaryId)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-muted/60 hover:bg-muted transition-colors w-full"
        data-testid={`cot-summary-${messageId}`}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <div className="flex items-center gap-1">
          {iconSequence.map((item, i) => {
            const Icon = messageTypeIcons[item.type]
            const colorClass = messageTypeColors[item.type]
            return (
              <span key={i} className="flex items-center" title={`${messageTypeLabels[item.type]} (${item.count})`}>
                <Icon className={`h-3 w-3 ${colorClass}`} />
                {item.count > 1 && (
                  <span className={`text-[9px] ml-0.5 ${colorClass} opacity-80`}>{item.count}</span>
                )}
                {i < iconSequence.length - 1 && (
                  <span className="text-muted-foreground/40 mx-0.5">›</span>
                )}
              </span>
            )
          })}
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {taskMessages.length} steps
        </span>
      </button>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="mt-1 ml-1 space-y-1 border-l-2 border-muted pl-2">
          {actionGroups.map((group, groupIndex) => {
            const detailId = `${messageId}-detail-${group.type}-${groupIndex}`
            const isDetailExpanded = expandedSections.has(detailId)
            const Icon = messageTypeIcons[group.type]
            const colorClass = messageTypeColors[group.type]
            const label = messageTypeLabels[group.type]

            // Handoff: always prominent
            if (group.type === "handoff") {
              return (
                <div
                  key={detailId}
                  className="flex items-center gap-2 px-2 py-1 rounded-md bg-teal-500/10 border border-teal-500/20"
                >
                  <ArrowRightLeft className="h-3 w-3 text-teal-500" />
                  {group.messages.map((msg, i) => {
                    const content = msg.content as { text?: string }
                    return (
                      <span key={i} className="text-xs text-teal-600 dark:text-teal-400 font-medium">
                        {content.text}
                      </span>
                    )
                  })}
                </div>
              )
            }

            return (
              <div key={detailId}>
                <button
                  onClick={() => toggleSection(detailId)}
                  className="flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors w-full text-left"
                  data-testid={`toggle-${group.type}-${groupIndex}`}
                >
                  {isDetailExpanded ? (
                    <ChevronDown className="h-2.5 w-2.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                  )}
                  <Icon className={`h-3 w-3 shrink-0 ${colorClass}`} />
                  <span className={`${colorClass} font-medium`}>{label}</span>
                  <Badge variant="secondary" className="text-[9px] h-4 ml-auto">
                    {group.messages.length}
                  </Badge>
                </button>

                {isDetailExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {group.messages.map((msg, i) => {
                      const content = msg.content as {
                        text?: string
                        skill_name?: string
                        status?: string
                        error?: string
                        message?: string
                      }
                      const displayText =
                        content.text ||
                        content.skill_name ||
                        content.status ||
                        content.error ||
                        content.message ||
                        JSON.stringify(content)

                      return (
                        <div
                          key={i}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground leading-relaxed"
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
      )}
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
