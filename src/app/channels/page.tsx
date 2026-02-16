"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import { RefreshCw, Plus, Trash2, Check } from "lucide-react"

// ============================================================================
// Types
// ============================================================================

interface AgentRecord {
  id: string
  name: string
  slug: string
  is_active: boolean
  slack_app_id: string | null
  slack_bot_token_secret: string | null
  slack_reply_mode: 'all_messages' | 'mentions_only' | null
}

interface VaultSecret {
  secret_name: string
  description: string
  created_at: string
}

// ============================================================================
// Component
// ============================================================================

export default function ChannelsPage() {
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecret[]>([])
  const [status, setStatus] = useState("")

  // Bot dialog
  const [botDialogOpen, setBotDialogOpen] = useState(false)
  const [botForm, setBotForm] = useState({
    agent_id: "",
    slack_app_id: "",
    bot_token: "",
    app_token: "",
    reply_mode: "mentions_only" as "all_messages" | "mentions_only",
  })
  const [savingBot, setSavingBot] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)

  // ============================================================================
  // Data fetching
  // ============================================================================

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    await Promise.all([fetchAgents(), fetchVaultSecrets()])
  }

  async function fetchAgents() {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    try {
      const { data } = await supabase
        .from("agents")
        .select("id, name, slug, is_active, slack_app_id, slack_bot_token_secret, slack_reply_mode")
        .eq("is_active", true)
        .order("name")

      setAgents((data as AgentRecord[]) || [])
    } catch (err) {
      console.error("Failed to fetch agents:", err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchVaultSecrets() {
    try {
      const res = await fetch("/api/vault")
      if (res.ok) {
        const data = await res.json()
        setVaultSecrets(Array.isArray(data) ? data : data.secrets || [])
      }
    } catch (err) {
      console.error("Failed to fetch vault secrets:", err)
    }
  }

  // ============================================================================
  // Bot management
  // ============================================================================

  function hasSecret(name: string): boolean {
    return vaultSecrets.some((s) => s.secret_name === name)
  }

  function openAddBotDialog() {
    setBotForm({ 
      agent_id: "", 
      slack_app_id: "", 
      bot_token: "", 
      app_token: "", 
      reply_mode: "mentions_only" 
    })
    setEditingAgentId(null)
    setBotDialogOpen(true)
  }

  function openEditBotDialog(agent: AgentRecord) {
    setBotForm({
      agent_id: agent.id,
      slack_app_id: agent.slack_app_id || "",
      bot_token: "",
      app_token: "",
      reply_mode: agent.slack_reply_mode || "mentions_only",
    })
    setEditingAgentId(agent.id)
    setBotDialogOpen(true)
  }

  async function handleSaveBot() {
    if (!supabase || !botForm.agent_id || !botForm.slack_app_id) return
    setSavingBot(true)

    try {
      const agent = agents.find((a) => a.id === botForm.agent_id)
      if (!agent) throw new Error("Agent not found")

      const slugUpper = agent.slug.toUpperCase().replace(/-/g, "_")
      const tokenSecretName = `SLACK_BOT_TOKEN_${slugUpper}`
      const appTokenSecretName = `SLACK_APP_TOKEN_${slugUpper}`

      // Save bot token if provided
      if (botForm.bot_token.trim()) {
        await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret_name: tokenSecretName,
            secret_value: botForm.bot_token.trim(),
            secret_description: `Slack bot token for ${agent.name}`,
          }),
        })
      }

      // Save app token if provided
      if (botForm.app_token.trim()) {
        await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret_name: appTokenSecretName,
            secret_value: botForm.app_token.trim(),
            secret_description: `Slack app token for ${agent.name}`,
          }),
        })
      }

      // Update agent
      await supabase
        .from("agents")
        .update({
          slack_app_id: botForm.slack_app_id.trim(),
          slack_bot_token_secret: tokenSecretName,
          slack_reply_mode: botForm.reply_mode,
        })
        .eq("id", botForm.agent_id)

      setBotDialogOpen(false)
      await Promise.all([fetchAgents(), fetchVaultSecrets()])
      showStatus(`Bot configured for ${agent.name}`)
    } catch (err) {
      console.error("Failed to save bot config:", err)
    } finally {
      setSavingBot(false)
    }
  }

  async function handleRemoveBot(agentId: string) {
    if (!supabase) return
    try {
      await supabase
        .from("agents")
        .update({
          slack_app_id: null,
          slack_bot_token_secret: null,
          slack_reply_mode: null,
        })
        .eq("id", agentId)

      await fetchAgents()
      showStatus("Bot removed")
    } catch (err) {
      console.error("Failed to remove bot:", err)
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function showStatus(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(""), 3000)
  }

  const slackBots = agents.filter((a) => a.slack_app_id)
  const availableAgents = agents.filter((a) => !a.slack_app_id)

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Slack Bots</h1>
          <p className="text-muted-foreground">Configure Slack Socket Mode bots for agents</p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <Badge variant="secondary" className="animate-in fade-in">
              <Check className="h-3 w-3 mr-1" />
              {status}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={openAddBotDialog} disabled={availableAgents.length === 0}>
            <Plus className="h-4 w-4 mr-1" />
            Add Bot
          </Button>
        </div>
      </div>

      {/* Socket Mode info */}
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Socket Mode: No public URL required. Bots connect via WebSocket to Slack.
        </p>
      </div>

      {/* Bots List */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Bots ({slackBots.length})</CardTitle>
          <CardDescription>Agents mapped to Slack apps</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-lg border">
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : slackBots.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No Slack bots configured</p>
              <Button onClick={openAddBotDialog} disabled={availableAgents.length === 0}>
                <Plus className="h-4 w-4 mr-1" />
                Add Your First Bot
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {slackBots.map((agent) => (
                <div
                  key={agent.id}
                  className="p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Agent name */}
                      <div>
                        <h3 className="font-semibold text-lg">{agent.name}</h3>
                        <p className="text-sm text-muted-foreground font-mono">{agent.slug}</p>
                      </div>

                      {/* Config grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Slack App ID</p>
                          <p className="font-mono text-sm">{agent.slack_app_id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Reply Mode</p>
                          <Badge variant="outline">
                            {agent.slack_reply_mode === 'all_messages' ? 'All Messages' : '@ Mentions Only'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Bot Token</p>
                          <Badge className={
                            agent.slack_bot_token_secret && hasSecret(agent.slack_bot_token_secret)
                              ? "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
                              : "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
                          }>
                            {agent.slack_bot_token_secret && hasSecret(agent.slack_bot_token_secret)
                              ? "Configured" : "Missing"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEditBotDialog(agent)}>
                        Edit
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9" 
                        onClick={() => handleRemoveBot(agent.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Add/Edit Bot Dialog */}
      {/* ================================================================ */}
      <Dialog open={botDialogOpen} onOpenChange={setBotDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAgentId ? "Edit Slack Bot" : "Add Slack Bot"}
            </DialogTitle>
            <DialogDescription>
              Configure Socket Mode bot for an agent
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Agent selector */}
            {!editingAgentId && (
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select value={botForm.agent_id} onValueChange={(v) => setBotForm((f) => ({ ...f, agent_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* App ID */}
            <div className="space-y-2">
              <Label>Slack App ID</Label>
              <Input
                value={botForm.slack_app_id}
                onChange={(e) => setBotForm((f) => ({ ...f, slack_app_id: e.target.value }))}
                placeholder="A0XXXXXXXXX"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                From your Slack app's Basic Information page
              </p>
            </div>

            {/* Reply Mode */}
            <div className="space-y-2">
              <Label>Reply Mode</Label>
              <Select 
                value={botForm.reply_mode} 
                onValueChange={(v: "all_messages" | "mentions_only") => setBotForm((f) => ({ ...f, reply_mode: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mentions_only">@ Mentions Only</SelectItem>
                  <SelectItem value="all_messages">All Messages</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {botForm.reply_mode === 'all_messages' 
                  ? 'Bot replies to all messages in channels it\'s added to' 
                  : 'Bot only replies when @mentioned'}
              </p>
            </div>

            {/* Bot Token */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Bot Token (xoxb-...)
                {editingAgentId && (() => {
                  const a = agents.find((ag) => ag.id === editingAgentId)
                  return a?.slack_bot_token_secret && hasSecret(a.slack_bot_token_secret)
                    ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">Configured</span>
                    : null
                })()}
              </Label>
              <Input
                type="password"
                value={botForm.bot_token}
                onChange={(e) => setBotForm((f) => ({ ...f, bot_token: e.target.value }))}
                placeholder={editingAgentId ? "Enter new token to update" : "xoxb-..."}
              />
            </div>

            {/* App Token */}
            <div className="space-y-2">
              <Label>App Token (xapp-...) - Optional</Label>
              <Input
                type="password"
                value={botForm.app_token}
                onChange={(e) => setBotForm((f) => ({ ...f, app_token: e.target.value }))}
                placeholder="xapp-... (leave empty to use global)"
              />
              <p className="text-xs text-muted-foreground">
                Falls back to SLACK_APP_TOKEN if not provided
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBotDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveBot}
              disabled={savingBot || !botForm.agent_id || !botForm.slack_app_id.trim()}
            >
              {savingBot ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
