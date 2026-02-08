"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Task, Agent, Session } from "@/lib/supabase-types"
import type { TaskMessage, MessageType } from "@/lib/supabase-types"
import {
  Bot,
  Send,
  Loader2,
  MessageSquare,
  Plus,
  Brain,
  Wrench,
  Sparkles,
  GitBranch,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ArrowRightLeft,
  Users,
  Clock,
  Search,
  ShieldAlert,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import Link from "next/link"

// ─── Types ───

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  status?: string
  taskId?: string
  taskMessages?: TaskMessage[]
  delegation?: DelegationInfo | null
}

interface DelegationInfo {
  childSessionId: string
  childTaskId: string
  targetAgentSlug: string
  targetAgentName?: string
  status: string
  startedAt: string
  completedAt?: string
}

// ─── Constants ───

const MESSAGE_TYPE_ICONS: Record<string, typeof Brain> = {
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
  delegation_start: Users,
  delegation_complete: Users,
}

const MESSAGE_TYPE_COLORS: Record<string, string> = {
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

const MESSAGE_TYPE_LABELS: Record<string, string> = {
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

// ─── Main Page ───

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <ChatPageContent />
    </Suspense>
  )
}

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionParam = searchParams.get("session")

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>("")
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionParam)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  // ─── Data fetching ───

  useEffect(() => {
    fetchAgents()
    fetchSessions()
  }, [])

  useEffect(() => {
    if (activeSessionId) {
      loadConversation(activeSessionId)
      // Update URL
      const url = new URL(window.location.href)
      url.searchParams.set("session", activeSessionId)
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }, [activeSessionId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // ─── Realtime subscriptions ───

  useEffect(() => {
    if (!supabase || !activeSessionId) return

    const client = supabase
    const channel = client
      .channel(`chat-${activeSessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (payload) => {
          const updatedTask = payload.new as Task
          const output = updatedTask.output as { response?: string; error?: string }

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.taskId !== updatedTask.id) return msg

              if (updatedTask.status === "completed" && output?.response) {
                return { ...msg, status: "completed", content: output.response }
              }
              if (updatedTask.status === "failed") {
                return { ...msg, status: "failed", content: output?.error || "Task failed" }
              }
              // needs_human_review = approval required
              if (updatedTask.status === "needs_human_review") {
                const prevContent = output?.response || msg.content || ""
                return { ...msg, status: "needs_human_review", content: prevContent || "Awaiting approval..." }
              }
              // pending_subtask = delegation in progress
              if (updatedTask.status === "pending_subtask") {
                const iData = updatedTask.intermediate_data as {
                  delegation?: DelegationInfo & {
                    child_session_id?: string
                    child_task_id?: string
                    target_agent_slug?: string
                    delegated_at?: string
                  }
                }
                if (iData?.delegation) {
                  return {
                    ...msg,
                    status: "pending_subtask",
                    delegation: {
                      childSessionId: iData.delegation.child_session_id || "",
                      childTaskId: iData.delegation.child_task_id || "",
                      targetAgentSlug: iData.delegation.target_agent_slug || "",
                      status: "running",
                      startedAt: iData.delegation.delegated_at || new Date().toISOString(),
                    },
                  }
                }
              }
              return { ...msg, status: updatedTask.status }
            })
          )
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (payload) => {
          const newTask = payload.new as Task
          if (newTask.session_id !== activeSessionId) return

          setMessages((prev) => {
            if (prev.some((m) => m.taskId === newTask.id)) return prev

            const lastPendingIdx = [...prev]
              .reverse()
              .findIndex(
                (m) =>
                  m.role === "assistant" &&
                  m.status &&
                  !["completed", "failed"].includes(m.status)
              )
            if (lastPendingIdx !== -1) {
              const actualIdx = prev.length - 1 - lastPendingIdx
              const updated = [...prev]
              updated[actualIdx] = {
                ...updated[actualIdx],
                taskId: newTask.id,
                content: "Processing...",
                status: newTask.status,
              }
              return updated
            }
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
          setLastTaskId(newTask.id)
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_messages" },
        (payload) => {
          const newMsg = payload.new as TaskMessage
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.taskId !== newMsg.task_id) return msg
              const existing = msg.taskMessages || []
              return {
                ...msg,
                taskMessages: [...existing, newMsg].sort(
                  (a, b) => a.sequence_number - b.sequence_number
                ),
              }
            })
          )
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [activeSessionId])

  // Also subscribe to session list updates
  useEffect(() => {
    if (!supabase) return

    const client = supabase
    const channel = client
      .channel("sessions-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sessions" },
        (payload) => {
          const newSession = payload.new as Session
          if (newSession.channel_type === "webchat" && !newSession.parent_session_id) {
            setSessions((prev) => [newSession, ...prev])
          }
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [])

  async function fetchAgents() {
    if (!supabase) return
    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("is_active", true)
      .order("name")
    setAgents(data || [])
    // Default to the default agent
    const def = data?.find((a) => a.is_default)
    if (def) setSelectedAgentId(def.id)
    else if (data?.length) setSelectedAgentId(data[0].id)
  }

  async function fetchSessions() {
    if (!supabase) return
    setLoadingSessions(true)
    try {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("channel_type", "webchat")
        .is("parent_session_id", null)
        .order("last_activity_at", { ascending: false })
        .limit(100)
      setSessions(data || [])
    } catch (err) {
      console.error("Failed to fetch sessions:", err)
    } finally {
      setLoadingSessions(false)
    }
  }

  async function loadConversation(sessionId: string) {
    if (!supabase) return
    try {
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })

      const allTasks = tasksData || []
      const newMessages: ChatMessage[] = []
      let last: string | null = null

      for (const t of allTasks) {
        const taskInput = t.input as { message?: string }
        const taskOutput = t.output as { response?: string; error?: string }

        // Fetch task messages
        const { data: tmData } = await supabase
          .from("task_messages" as any)
          .select("*")
          .eq("task_id", t.id)
          .order("sequence_number", { ascending: true })
        const taskMsgs = (tmData || []) as unknown as TaskMessage[]

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
        } else if (!["completed", "failed"].includes(t.status)) {
          // Check for delegation
          let delegation: DelegationInfo | null = null
          if (t.status === "pending_subtask" && t.intermediate_data) {
            const iData = t.intermediate_data as { delegation?: Record<string, string> }
            if (iData?.delegation) {
              delegation = {
                childSessionId: iData.delegation.child_session_id || "",
                childTaskId: iData.delegation.child_task_id || "",
                targetAgentSlug: iData.delegation.target_agent_slug || "",
                status: "running",
                startedAt: iData.delegation.delegated_at || "",
              }
            }
          }

          newMessages.push({
            id: `pending-${t.id}`,
            role: "assistant",
            content: "Processing...",
            status: t.status,
            taskId: t.id,
            taskMessages: taskMsgs,
            delegation,
          })
        }
        last = t.id
      }

      setMessages(newMessages)
      setLastTaskId(last)

      // Set agent selector to match session agent
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("agent_id")
        .eq("id", sessionId)
        .single()
      if (sessionData?.agent_id) setSelectedAgentId(sessionData.agent_id)
    } catch (err) {
      console.error("Failed to load conversation:", err)
    }
  }

  // ─── Actions ───

  function handleNewChat() {
    setMessages([])
    setActiveSessionId(null)
    setLastTaskId(null)
    router.replace("/chat", { scroll: false })
  }

  function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending || !supabase) return

    const userMessage = input.trim()
    setInput("")
    setSending(true)

    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: userMessage }])

    try {
      let sessionId = activeSessionId
      const selectedAgent = agents.find((a) => a.id === selectedAgentId)

      // Create session if new
      if (!sessionId) {
        const { data: session, error: sessionError } = await supabase
          .from("sessions")
          .insert({
            agent_id: selectedAgent?.id || null,
            channel_type: "webchat",
            display_name: userMessage.slice(0, 60),
            status: "active",
          })
          .select()
          .single()

        if (sessionError) throw sessionError
        sessionId = session.id
        setActiveSessionId(sessionId)
        setSessions((prev) => [session, ...prev])
      }

      const taskData: Record<string, unknown> = {
        agent_id: selectedAgent?.id || null,
        agent_slug: selectedAgent?.slug || null,
        status: "pending",
        input: { message: userMessage },
        session_id: sessionId,
      }
      if (lastTaskId) taskData.parent_id = lastTaskId

      const { data: task, error } = await supabase
        .from("tasks")
        .insert(taskData)
        .select()
        .single()

      if (error) throw error

      setLastTaskId(task.id)
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

      // Task pickup handled by pgmq queue trigger (queue_task_for_processing)
    } catch (err) {
      console.error("Failed to create task:", err)
      setMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: "assistant", content: "Failed to send message." },
      ])
    } finally {
      setSending(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  const filteredSessions = searchQuery
    ? sessions.filter(
        (s) =>
          s.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.id.includes(searchQuery)
      )
    : sessions

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── Conversation Sidebar ─── */}
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <Button size="sm" className="w-full" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            <div className="p-1">
              {filteredSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSession(s.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors",
                    activeSessionId === s.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  )}
                >
                  <p className="font-medium truncate text-xs">
                    {s.display_name || "Untitled"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {s.last_activity_at
                      ? formatDistanceToNow(new Date(s.last_activity_at), { addSuffix: true })
                      : s.created_at
                      ? formatDistanceToNow(new Date(s.created_at), { addSuffix: true })
                      : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ─── Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Chat</span>
            {activeSessionId && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {activeSessionId.slice(0, 8)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-1.5">
                      <Bot className="h-3 w-3" />
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
              <p className="font-medium">Start a conversation</p>
              <p className="text-sm mt-1">
                {selectedAgent
                  ? `Chatting with ${selectedAgent.name}`
                  : "Select an agent to begin"}
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
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
                        {/* Chain of thought */}
                        {msg.taskMessages && msg.taskMessages.length > 0 && (
                          <ChainOfThoughtSummary
                            taskMessages={msg.taskMessages}
                            messageId={msg.id}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                          />
                        )}

                        {/* Delegation indicator */}
                        {msg.delegation && (
                          <DelegationCard delegation={msg.delegation} />
                        )}

                        {/* Response bubble */}
                        <div className="rounded-lg px-3 py-2 bg-muted">
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {msg.status && !["completed", "failed"].includes(msg.status) && (
                            <div className="flex items-center gap-1 mt-1 text-xs opacity-70">
                              {msg.status === "needs_human_review" ? (
                                <>
                                  <ShieldAlert className="h-3 w-3 text-amber-500" />
                                  <span className="text-amber-500">
                                    Awaiting approval —{" "}
                                    {msg.taskId ? (
                                      <Link href={`/tasks/${msg.taskId}`} className="underline hover:text-amber-400">
                                        Review &amp; Approve
                                      </Link>
                                    ) : "check Tasks page"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {msg.status === "pending_subtask" ? "Delegating..." : msg.status}
                                </>
                              )}
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

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t shrink-0">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                sending
                  ? "Processing..."
                  : selectedAgent
                  ? "Type your message..."
                  : "Select an agent first"
              }
              disabled={sending || !selectedAgentId}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={sending || !input.trim() || !selectedAgentId}
              size="icon"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delegation Card ───

function DelegationCard({ delegation }: { delegation: DelegationInfo }) {
  const elapsed = delegation.startedAt
    ? Math.round((Date.now() - new Date(delegation.startedAt).getTime()) / 1000)
    : 0
  const isDone = delegation.status === "completed" || delegation.status === "failed"

  if (isDone) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-xs">
        <Users className="h-3.5 w-3.5 text-indigo-500" />
        <span className="text-indigo-600 dark:text-indigo-400 font-medium">
          {delegation.targetAgentSlug} completed
        </span>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 rounded-md bg-indigo-500/10 border border-indigo-500/20 space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
        <span className="text-indigo-600 dark:text-indigo-400 font-medium">
          Delegating to {delegation.targetAgentSlug}
        </span>
        <span className="ml-auto text-muted-foreground">
          {elapsed}s
        </span>
      </div>
      <Link
        href={`/sessions/${delegation.childSessionId}`}
        className="text-[10px] text-indigo-500 hover:underline inline-flex items-center gap-0.5"
      >
        View details <ChevronRight className="h-2.5 w-2.5" />
      </Link>
    </div>
  )
}

// ─── Chain of Thought Summary ───

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
  const actionGroups = groupedMessages.filter(
    (g) => g.type !== "user_message" && g.type !== "assistant_message"
  )
  if (actionGroups.length === 0) return null

  const summaryId = `${messageId}-cot-summary`
  const isExpanded = expandedSections.has(summaryId)

  const iconSequence: { type: string; count: number }[] = []
  for (const group of actionGroups) {
    iconSequence.push({ type: group.type, count: group.messages.length })
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => toggleSection(summaryId)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-muted/60 hover:bg-muted transition-colors w-full"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <div className="flex items-center gap-1">
          {iconSequence.map((item, i) => {
            const Icon = MESSAGE_TYPE_ICONS[item.type] || Brain
            const colorClass = MESSAGE_TYPE_COLORS[item.type] || "text-muted-foreground"
            return (
              <span
                key={i}
                className="flex items-center"
                title={`${MESSAGE_TYPE_LABELS[item.type] || item.type} (${item.count})`}
              >
                <Icon className={`h-3 w-3 ${colorClass}`} />
                {item.count > 1 && (
                  <span className={`text-[9px] ml-0.5 ${colorClass} opacity-80`}>
                    {item.count}
                  </span>
                )}
                {i < iconSequence.length - 1 && (
                  <span className="text-muted-foreground/40 mx-0.5">&rsaquo;</span>
                )}
              </span>
            )
          })}
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {taskMessages.length} steps
        </span>
      </button>

      {isExpanded && (
        <div className="mt-1 ml-1 space-y-1 border-l-2 border-muted pl-2">
          {actionGroups.map((group, groupIndex) => {
            const detailId = `${messageId}-detail-${group.type}-${groupIndex}`
            const isDetailExpanded = expandedSections.has(detailId)
            const Icon = MESSAGE_TYPE_ICONS[group.type] || Brain
            const colorClass = MESSAGE_TYPE_COLORS[group.type] || "text-muted-foreground"
            const label = MESSAGE_TYPE_LABELS[group.type] || group.type

            // Delegation messages: prominent
            if (group.type === "delegation_start" || group.type === "delegation_complete") {
              return (
                <div
                  key={detailId}
                  className="flex items-center gap-2 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20"
                >
                  <Users className="h-3 w-3 text-indigo-500" />
                  {group.messages.map((msg, i) => {
                    const content = msg.content as { text?: string }
                    return (
                      <span
                        key={i}
                        className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                      >
                        {content.text}
                      </span>
                    )
                  })}
                </div>
              )
            }

            // Legacy handoff
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
                      <span
                        key={i}
                        className="text-xs text-teal-600 dark:text-teal-400 font-medium"
                      >
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

// ─── Helpers ───

interface MessageGroup {
  type: string
  messages: TaskMessage[]
}

function groupTaskMessagesByType(messages: TaskMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const msg of messages) {
    if (!currentGroup || currentGroup.type !== msg.type) {
      if (currentGroup) groups.push(currentGroup)
      currentGroup = { type: msg.type, messages: [msg] }
    } else {
      currentGroup.messages.push(msg)
    }
  }
  if (currentGroup) groups.push(currentGroup)
  return groups
}
