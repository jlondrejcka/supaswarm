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
import { Bot, Send, Loader2, X, MessageSquare } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  status?: string
  taskId?: string
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
  const scrollRef = useRef<HTMLDivElement>(null)

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

    const pendingTaskIds = messages
      .filter((m) => m.taskId && m.status && m.status !== 'completed' && m.status !== 'failed')
      .map((m) => m.taskId!)

    if (pendingTaskIds.length === 0) return

    const client = supabase
    const pollInterval = setInterval(async () => {
      for (const taskId of pendingTaskIds) {
        const { data: task } = await client
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .single()

        if (task && (task.status === 'completed' || task.status === 'failed')) {
          const output = task.output as { response?: string; error?: string }
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.taskId === task.id) {
                if (task.status === 'completed' && output?.response) {
                  return {
                    ...msg,
                    status: 'completed',
                    content: output.response,
                  }
                } else if (task.status === 'failed') {
                  return {
                    ...msg,
                    status: 'failed',
                    content: output?.error || 'Task failed',
                  }
                }
              }
              return msg
            })
          )
        }
      }
    }, 2000)

    return () => {
      clearInterval(pollInterval)
    }
  }, [open, messages])

  async function fetchDefaultAgent() {
    if (!supabase) return

    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("is_default", true)
      .single()

    setDefaultAgent(data)
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
        },
      ])
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
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              AI Agent Chat
            </DialogTitle>
            {defaultAgent && (
              <Badge variant="outline" className="gap-1">
                {defaultAgent.name}
              </Badge>
            )}
          </div>
          {!defaultAgent && (
            <p className="text-sm text-muted-foreground">
              No default agent set. Go to Agents page to set one.
            </p>
          )}
        </DialogHeader>

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
                <div
                  key={msg.id}
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
      </DialogContent>
    </Dialog>
  )
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
