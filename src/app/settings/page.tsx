"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { LLMProvider } from "@/lib/supabase-types"
import { Settings, Key, Check, Save, AlertCircle, ExternalLink } from "lucide-react"

const ENV_VAR_NAMES: Record<string, string> = {
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    display_name: "",
    default_model: "",
    base_url: "",
  })

  useEffect(() => {
    fetchProviders()
  }, [])

  async function fetchProviders() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      const { data, error } = await supabase
        .from("llm_providers")
        .select("*")
        .order("display_name")

      if (error) throw error
      setProviders(data || [])
    } catch (error) {
      console.error("Failed to fetch providers:", error)
    } finally {
      setLoading(false)
    }
  }

  function openConfigDialog(provider: LLMProvider) {
    setSelectedProvider(provider)
    setFormData({
      display_name: provider.display_name,
      default_model: provider.default_model,
      base_url: provider.base_url || "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!supabase || !selectedProvider) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from("llm_providers")
        .update({
          display_name: formData.display_name,
          default_model: formData.default_model,
          base_url: formData.base_url || null,
        })
        .eq("id", selectedProvider.id)

      if (error) throw error

      await fetchProviders()
      setDialogOpen(false)
    } catch (error) {
      console.error("Failed to update provider:", error)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(provider: LLMProvider) {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from("llm_providers")
        .update({ is_active: !provider.is_active })
        .eq("id", provider.id)

      if (error) throw error
      await fetchProviders()
    } catch (error) {
      console.error("Failed to toggle provider:", error)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const envVarName = selectedProvider ? ENV_VAR_NAMES[selectedProvider.name] || `${selectedProvider.name.toUpperCase()}_API_KEY` : ""

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground">Configure LLM providers and platform settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            LLM Providers
          </CardTitle>
          <CardDescription>
            Configure AI model providers for agent orchestration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-md border">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : providers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No providers configured</p>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => (
                <div key={provider.id} className="flex items-center gap-4 p-3 rounded-md border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" data-testid={`text-provider-${provider.id}`}>
                        {provider.display_name}
                      </span>
                      <Badge 
                        variant={provider.is_active ? "default" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => toggleActive(provider)}
                        data-testid={`badge-status-${provider.id}`}
                      >
                        {provider.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {provider.has_api_key && (
                        <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                          <Check className="h-3 w-3" />
                          Key Configured
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Default model: {provider.default_model}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => openConfigDialog(provider)}
                      data-testid={`button-configure-${provider.id}`}
                    >
                      <Settings className="h-4 w-4" />
                      Configure
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>
            General platform configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-3 rounded-md border flex-wrap">
              <div>
                <p className="font-medium">Supabase Project</p>
                <p className="text-sm text-muted-foreground font-mono">bgqxccmdcpegvbuxmnrf</p>
              </div>
              <Badge variant="outline">Connected</Badge>
            </div>
            <div className="flex items-center justify-between gap-4 p-3 rounded-md border flex-wrap">
              <div>
                <p className="font-medium">Real-time Updates</p>
                <p className="text-sm text-muted-foreground">Subscribe to task and agent changes</p>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure {selectedProvider?.display_name}</DialogTitle>
            <DialogDescription>
              Update the settings for this LLM provider
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                data-testid="input-display-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_model">Default Model</Label>
              <Input
                id="default_model"
                value={formData.default_model}
                onChange={(e) => setFormData({ ...formData, default_model: e.target.value })}
                placeholder="e.g., gpt-4, claude-3-opus"
                data-testid="input-default-model"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="base_url">Base URL</Label>
              <Input
                id="base_url"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="https://api.example.com/v1"
                data-testid="input-base-url"
              />
            </div>

            {selectedProvider?.requires_api_key && (
              <div className="p-3 rounded-md bg-muted space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">API Key Required</p>
                    <p className="text-xs text-muted-foreground">
                      For security, API keys are stored as environment secrets. Add your key as:
                    </p>
                    <code className="text-xs bg-background px-2 py-1 rounded block mt-1">
                      {envVarName}
                    </code>
                    <p className="text-xs text-muted-foreground mt-2">
                      In Replit, go to Secrets tab and add the key there. For production, use Supabase Vault.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
