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
import { RefreshCw, Shield, Save, Plus, Trash2, Copy, Check, AlertCircle, Link } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

// ============================================================================
// Types
// ============================================================================

interface ChannelConnection {
  id: string
  channel_type: string
  channel_id: string
  display_name: string | null
  status: string
  config?: Record<string, unknown> | null
  agent_id?: string | null
  created_at: string
  updated_at?: string
  last_event_at?: string | null
  message_count?: number
  error_message?: string | null
}

interface VaultSecret {
  secret_name: string
  description: string
  created_at: string
}

interface AgentRecord {
  id: string
  name: string
  slug: string
  is_active: boolean
  slack_app_id: string | null
  slack_bot_token_secret: string | null
  slack_signing_secret_name: string | null
}

// Required Slack secrets for global config
const SLACK_SECRETS = [
  {
    key: "SLACK_BOT_TOKEN",
    label: "Bot Token",
    description: "xoxb-... token from your Slack app",
    placeholder: "xoxb-...",
  },
  {
    key: "SLACK_SIGNING_SECRET",
    label: "Signing Secret",
    description: "From Slack app Basic Information page",
    placeholder: "Enter signing secret",
  },
]

// ============================================================================
// Component
// ============================================================================

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelConnection[]>([])
  const [loading, setLoading] = useState(true)

  // Slack config state
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecret[]>([])
  const [vaultLoading, setVaultLoading] = useState(true)
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({})
  const [savingSecret, setSavingSecret] = useState<string | null>(null)
  const [defaultAgentId, setDefaultAgentId] = useState<string>("")
  const [savingDefault, setSavingDefault] = useState(false)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState("")

  // Per-agent Slack bot dialog
  const [botDialogOpen, setBotDialogOpen] = useState(false)
  const [botForm, setBotForm] = useState({
    agent_id: "",
    slack_app_id: "",
    bot_token: "",
    signing_secret: "",
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
    await Promise.all([fetchChannels(), fetchVaultSecrets(), fetchAgents()])
  }

  async function fetchChannels() {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    try {
      const { data: channelsData, error: channelsError } = await supabase
        .from("channel_connections" as any)
        .select("*")
        .order("created_at", { ascending: false })

      if (channelsError) throw channelsError

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

      // Load default agent from slack channel_connection config
      const slackConn = (channelsData || []).find((c: any) => c.channel_type === "slack")
      if (slackConn?.config?.default_agent_id) {
        setDefaultAgentId(slackConn.config.default_agent_id as string)
      }

      setChannels(channelsWithAgents)
    } catch (error) {
      console.error("Failed to fetch channels:", error)
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
    } finally {
      setVaultLoading(false)
    }
  }

  async function fetchAgents() {
    if (!supabase) return
    try {
      const { data } = await supabase
        .from("agents")
        .select("id, name, slug, is_active, slack_app_id, slack_bot_token_secret, slack_signing_secret_name")
        .eq("is_active", true)
        .order("name")

      setAgents((data as AgentRecord[]) || [])
    } catch (err) {
      console.error("Failed to fetch agents:", err)
    }
  }

  // ============================================================================
  // Secret management
  // ============================================================================

  function hasSecret(name: string): boolean {
    return vaultSecrets.some((s) => s.secret_name === name)
  }

  async function handleSaveGlobalConfig() {
    setSavingSecret("all")
    try {
      const saves: Promise<Response>[] = []

      for (const secret of SLACK_SECRETS) {
        const value = secretInputs[secret.key]?.trim()
        if (value) {
          saves.push(
            fetch("/api/vault", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                secret_name: secret.key,
                secret_value: value,
                secret_description: `Slack: ${secret.label}`,
              }),
            })
          )
        }
      }

      if (saves.length === 0) {
        setSavingSecret(null)
        return
      }

      await Promise.all(saves)
      setSecretInputs({})
      await fetchVaultSecrets()
      showStatus("Slack config saved")
    } catch (err) {
      console.error("Failed to save secrets:", err)
    } finally {
      setSavingSecret(null)
    }
  }

  // ============================================================================
  // Default agent
  // ============================================================================

  async function handleSaveDefaultAgent(agentId: string) {
    if (!supabase) return
    setSavingDefault(true)
    setDefaultAgentId(agentId)
    try {
      // Upsert channel_connections with default_agent_id in config
      await supabase
        .from("channel_connections" as any)
        .upsert(
          {
            channel_type: "slack",
            channel_id: "_global_slack_config",
            display_name: "Slack (Global Config)",
            status: "active",
            config: { default_agent_id: agentId },
          },
          { onConflict: "channel_id" }
        )
      showStatus("Default agent saved")
    } catch (err) {
      console.error("Failed to save default agent:", err)
    } finally {
      setSavingDefault(false)
    }
  }

  // ============================================================================
  // Per-agent Slack bot
  // ============================================================================

  function openAddBotDialog() {
    setBotForm({ agent_id: "", slack_app_id: "", bot_token: "", signing_secret: "" })
    setEditingAgentId(null)
    setBotDialogOpen(true)
  }

  function openEditBotDialog(agent: AgentRecord) {
    setBotForm({
      agent_id: agent.id,
      slack_app_id: agent.slack_app_id || "",
      bot_token: "",
      signing_secret: "",
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
      const signingSecretName = `SLACK_SIGNING_SECRET_${slugUpper}`

      // Save tokens to vault if provided
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

      if (botForm.signing_secret.trim()) {
        await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret_name: signingSecretName,
            secret_value: botForm.signing_secret.trim(),
            secret_description: `Slack signing secret for ${agent.name}`,
          }),
        })
      }

      // Update agent with Slack app mapping
      await supabase
        .from("agents")
        .update({
          slack_app_id: botForm.slack_app_id.trim(),
          slack_bot_token_secret: tokenSecretName,
          slack_signing_secret_name: signingSecretName,
        })
        .eq("id", botForm.agent_id)

      setBotDialogOpen(false)
      await Promise.all([fetchAgents(), fetchVaultSecrets()])
      showStatus(`Slack bot configured for ${agent.name}`)
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
          slack_signing_secret_name: null,
        })
        .eq("id", agentId)

      await fetchAgents()
      showStatus("Slack bot removed from agent")
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

  const webhookUrl = typeof window !== "undefined"
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/slack-events`
    : ""

  const globalReady = hasSecret("SLACK_BOT_TOKEN") && hasSecret("SLACK_SIGNING_SECRET")
  const slackAgents = agents.filter((a) => a.slack_app_id)
  const availableAgents = agents.filter((a) => !a.slack_app_id)

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const getStatusColor = (s: string) => {
    if (s === "active") return "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400 dark:bg-green-500/20"
    return "bg-gray-500/10 text-gray-700 border-gray-500/20 dark:text-gray-400 dark:bg-gray-500/20"
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Channels</h1>
          <p className="text-muted-foreground">Configure integrations and monitor channel connections</p>
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
        </div>
      </div>

      {/* ================================================================ */}
      {/* Global Slack Config */}
      {/* ================================================================ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Slack Integration
              </CardTitle>
              <CardDescription>
                Configure Slack Events API connection
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={globalReady
                ? "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
                : "bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400"
              }>
                {globalReady ? "Ready" : "Setup Incomplete"}
              </Badge>
              <Button
                size="sm"
                disabled={
                  savingSecret === "all" ||
                  !SLACK_SECRETS.some((s) => secretInputs[s.key]?.trim())
                }
                onClick={handleSaveGlobalConfig}
              >
                <Save className="h-4 w-4" />
                {savingSecret === "all" ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Webhook URL */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Link className="h-3 w-3" />
              Webhook URL
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="h-8 text-sm font-mono bg-muted"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Paste this into your Slack app&apos;s Event Subscriptions URL. All Slack apps share this endpoint.
            </p>
          </div>

          {/* Global secrets */}
          {vaultLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {SLACK_SECRETS.map((secret) => (
                <div key={secret.key} className="space-y-1">
                  <Label className="text-xs flex items-center gap-2">
                    {secret.label}
                    {hasSecret(secret.key) ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                        Configured
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">
                        Not set
                      </span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    placeholder={hasSecret(secret.key) ? "Enter new value to update" : secret.placeholder}
                    value={secretInputs[secret.key] || ""}
                    onChange={(e) => setSecretInputs((prev) => ({ ...prev, [secret.key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {secret.description} — stored as <code className="bg-muted px-1 rounded">{secret.key}</code> in Vault
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Default Agent */}
          <div className="space-y-1">
            <Label className="text-xs">Default Agent</Label>
            <div className="flex gap-2">
              <Select value={defaultAgentId} onValueChange={(v) => handleSaveDefaultAgent(v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select default agent for Slack" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} ({agent.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Handles messages from Slack apps not mapped to a specific agent
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Channel Connections + Slack Bot Mappings */}
      {/* ================================================================ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Channel Connections</CardTitle>
              <CardDescription>Active channels and Slack bot-to-agent mappings</CardDescription>
            </div>
            <Button size="sm" onClick={openAddBotDialog} disabled={availableAgents.length === 0}>
              <Plus className="h-4 w-4" />
              Add Slack Bot
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-md border">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <div className="flex-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : (slackAgents.length === 0 && channels.length === 0) ? (
            <div className="text-center py-6">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No connections or Slack bots configured yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Slack bot-to-agent mappings */}
              {slackAgents.map((agent) => (
                <div
                  key={`bot-${agent.id}`}
                  className="flex items-center gap-4 p-3 border rounded-lg hover:bg-accent/50 transition-colors flex-wrap"
                >
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium text-sm">Slack Bot</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">App ID</p>
                      <p className="font-mono text-sm">{agent.slack_app_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Agent</p>
                      <p className="font-medium text-sm">{agent.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bot Token</p>
                      <Badge className={
                        agent.slack_bot_token_secret && hasSecret(agent.slack_bot_token_secret)
                          ? "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
                          : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                      }>
                        {agent.slack_bot_token_secret && hasSecret(agent.slack_bot_token_secret)
                          ? "Configured" : "Not set"}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Signing Secret</p>
                      <Badge className={
                        agent.slack_signing_secret_name && hasSecret(agent.slack_signing_secret_name)
                          ? "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
                          : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                      }>
                        {agent.slack_signing_secret_name && hasSecret(agent.slack_signing_secret_name)
                          ? "Configured" : "Not set"}
                      </Badge>
                    </div>
                    <div className="flex items-end justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEditBotDialog(agent)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveBot(agent.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Channel connections */}
              {channels.map((channel) => (
                <div
                  key={`ch-${channel.id}`}
                  className="flex items-center gap-4 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium text-sm capitalize">{channel.channel_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Channel ID</p>
                      <p className="font-mono text-sm truncate">{channel.channel_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium text-sm">{channel.display_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge className={getStatusColor(channel.status)}>
                        {channel.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Agent</p>
                      <p className="font-mono text-sm">{channel.agent_id ? channel.agent_id.slice(0, 8) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-sm">
                        {channel.created_at && formatDistanceToNow(new Date(channel.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Add/Edit Slack Bot Dialog */}
      {/* ================================================================ */}
      <Dialog open={botDialogOpen} onOpenChange={setBotDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {editingAgentId ? "Edit Slack Bot" : "Add Slack Bot"}
            </DialogTitle>
            <DialogDescription>
              Map a Slack app to an agent. The agent will handle all messages from this app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Agent selector (only for new) */}
            {!editingAgentId && (
              <div className="space-y-1">
                <Label className="text-xs">Agent</Label>
                <Select value={botForm.agent_id} onValueChange={(v) => setBotForm((f) => ({ ...f, agent_id: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} ({agent.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* App ID */}
            <div className="space-y-1">
              <Label className="text-xs">Slack App ID</Label>
              <Input
                value={botForm.slack_app_id}
                onChange={(e) => setBotForm((f) => ({ ...f, slack_app_id: e.target.value }))}
                placeholder="A0XXXXXXXXX"
                className="h-8 text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Found on your Slack app&apos;s Basic Information page
              </p>
            </div>

            {/* Bot Token */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-2">
                Bot Token
                {editingAgentId && (() => {
                  const a = agents.find((ag) => ag.id === editingAgentId)
                  return a?.slack_bot_token_secret && hasSecret(a.slack_bot_token_secret)
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">Configured</span>
                    : null
                })()}
              </Label>
              <Input
                type="password"
                value={botForm.bot_token}
                onChange={(e) => setBotForm((f) => ({ ...f, bot_token: e.target.value }))}
                placeholder={editingAgentId ? "Enter new token to update" : "xoxb-..."}
                className="h-8 text-sm"
              />
              {botForm.agent_id && (
                <p className="text-[10px] text-muted-foreground">
                  Stored as <code className="bg-muted px-1 rounded">
                    SLACK_BOT_TOKEN_{(agents.find((a) => a.id === botForm.agent_id)?.slug || "").toUpperCase().replace(/-/g, "_")}
                  </code>
                </p>
              )}
            </div>

            {/* Signing Secret */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-2">
                Signing Secret
                {editingAgentId && (() => {
                  const a = agents.find((ag) => ag.id === editingAgentId)
                  return a?.slack_signing_secret_name && hasSecret(a.slack_signing_secret_name)
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">Configured</span>
                    : null
                })()}
              </Label>
              <Input
                type="password"
                value={botForm.signing_secret}
                onChange={(e) => setBotForm((f) => ({ ...f, signing_secret: e.target.value }))}
                placeholder={editingAgentId ? "Enter new secret to update" : "Enter signing secret"}
                className="h-8 text-sm"
              />
              {botForm.agent_id && (
                <p className="text-[10px] text-muted-foreground">
                  Stored as <code className="bg-muted px-1 rounded">
                    SLACK_SIGNING_SECRET_{(agents.find((a) => a.id === botForm.agent_id)?.slug || "").toUpperCase().replace(/-/g, "_")}
                  </code>
                </p>
              )}
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
              <Save className="h-4 w-4" />
              {savingBot ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
