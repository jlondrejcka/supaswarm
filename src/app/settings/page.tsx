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
import { Settings, Key, Check, Save, Shield, Trash2, Plus, Lock } from "lucide-react"

const ENV_VAR_NAMES: Record<string, string> = {
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
}

interface VaultSecret {
  secret_name: string
  description: string
  created_at: string
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
    api_key: "",
  })
  
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecret[]>([])
  const [vaultLoading, setVaultLoading] = useState(true)
  const [newSecretDialog, setNewSecretDialog] = useState(false)
  const [newSecretData, setNewSecretData] = useState({ name: "", value: "", description: "" })
  const [savingSecret, setSavingSecret] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error", text: string } | null>(null)

  useEffect(() => {
    fetchProviders()
    fetchVaultSecrets()
  }, [])

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

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

  async function fetchVaultSecrets() {
    if (!supabase) {
      setVaultLoading(false)
      return
    }
    
    try {
      const { data, error } = await supabase.rpc("list_vault_secrets")
      if (error) throw error
      setVaultSecrets(data || [])
    } catch (error) {
      console.error("Failed to fetch vault secrets:", error)
    } finally {
      setVaultLoading(false)
    }
  }

  function openConfigDialog(provider: LLMProvider) {
    setSelectedProvider(provider)
    setFormData({
      display_name: provider.display_name,
      default_model: provider.default_model,
      base_url: provider.base_url || "",
      api_key: "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!supabase || !selectedProvider) return

    setSaving(true)
    try {
      const envVarName = ENV_VAR_NAMES[selectedProvider.name] || `${selectedProvider.name.toUpperCase()}_API_KEY`
      
      // Save API key to vault if provided
      if (formData.api_key.trim()) {
        const { error: vaultError } = await supabase.rpc("upsert_vault_secret", {
          secret_name: envVarName,
          secret_value: formData.api_key.trim(),
          secret_description: `API key for ${selectedProvider.display_name}`,
        })
        
        if (vaultError) throw vaultError
        
        // Update has_api_key flag
        await supabase
          .from("llm_providers")
          .update({ has_api_key: true })
          .eq("id", selectedProvider.id)
          
        setStatusMessage({ type: "success", text: `${envVarName} saved to Vault` })
      }

      // Update provider settings
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
      await fetchVaultSecrets()
      setDialogOpen(false)
    } catch (error) {
      console.error("Failed to update provider:", error)
      setStatusMessage({ type: "error", text: "Failed to save settings" })
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

  async function handleAddSecret() {
    if (!supabase || !newSecretData.name.trim() || !newSecretData.value.trim()) return
    
    setSavingSecret(true)
    try {
      const { error } = await supabase.rpc("upsert_vault_secret", {
        secret_name: newSecretData.name.trim(),
        secret_value: newSecretData.value.trim(),
        secret_description: newSecretData.description.trim() || undefined,
      })
      
      if (error) throw error
      
      setStatusMessage({ type: "success", text: `${newSecretData.name} saved to Vault` })
      
      await fetchVaultSecrets()
      setNewSecretDialog(false)
      setNewSecretData({ name: "", value: "", description: "" })
    } catch (error) {
      console.error("Failed to save secret:", error)
      setStatusMessage({ type: "error", text: "Failed to save secret" })
    } finally {
      setSavingSecret(false)
    }
  }

  async function handleDeleteSecret(secretName: string) {
    if (!supabase) return
    
    try {
      const { error } = await supabase.rpc("delete_vault_secret", {
        secret_name: secretName,
      })
      
      if (error) throw error
      
      setStatusMessage({ type: "success", text: `${secretName} deleted` })
      
      await fetchVaultSecrets()
      await fetchProviders()
    } catch (error) {
      console.error("Failed to delete secret:", error)
      setStatusMessage({ type: "error", text: "Failed to delete secret" })
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const envVarName = selectedProvider ? ENV_VAR_NAMES[selectedProvider.name] || `${selectedProvider.name.toUpperCase()}_API_KEY` : ""
  const selectedProviderHasKey = vaultSecrets.some(s => s.secret_name === envVarName)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Settings</h1>
          <p className="text-muted-foreground">Configure LLM providers and manage secrets</p>
        </div>
        {statusMessage && (
          <Badge variant={statusMessage.type === "success" ? "default" : "destructive"}>
            {statusMessage.text}
          </Badge>
        )}
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
              {providers.map((provider) => {
                const providerEnvVar = ENV_VAR_NAMES[provider.name] || `${provider.name.toUpperCase()}_API_KEY`
                const hasVaultKey = vaultSecrets.some(s => s.secret_name === providerEnvVar)
                
                return (
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
                        {hasVaultKey && (
                          <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                            <Check className="h-3 w-3" />
                            Key in Vault
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
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Vault Secrets
              </CardTitle>
              <CardDescription>
                Securely stored secrets for the platform
              </CardDescription>
            </div>
            <Button onClick={() => setNewSecretDialog(true)} data-testid="button-add-secret">
              <Plus className="h-4 w-4" />
              Add Secret
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {vaultLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-md border">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : vaultSecrets.length === 0 ? (
            <div className="text-center py-8">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No secrets stored in Vault</p>
              <p className="text-sm text-muted-foreground mt-1">Add API keys and other secrets to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vaultSecrets.map((secret) => (
                <div key={secret.secret_name} className="flex items-center gap-4 p-3 rounded-md border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded" data-testid={`text-secret-${secret.secret_name}`}>
                        {secret.secret_name}
                      </code>
                    </div>
                    {secret.description && (
                      <p className="text-sm text-muted-foreground mt-1">{secret.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteSecret(secret.secret_name)}
                    data-testid={`button-delete-${secret.secret_name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
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
              <div className="space-y-2">
                <Label htmlFor="api_key" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  API Key
                  {selectedProviderHasKey && (
                    <Badge variant="outline" className="text-xs">Already configured</Badge>
                  )}
                </Label>
                <Input
                  id="api_key"
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder={selectedProviderHasKey ? "Enter new key to update" : "Enter your API key"}
                  data-testid="input-api-key"
                />
                <p className="text-xs text-muted-foreground">
                  Will be stored as <code className="bg-muted px-1 rounded">{envVarName}</code> in Supabase Vault
                </p>
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

      <Dialog open={newSecretDialog} onOpenChange={setNewSecretDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Add New Secret
            </DialogTitle>
            <DialogDescription>
              Store a new secret securely in Supabase Vault
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="secret_name">Secret Name</Label>
              <Input
                id="secret_name"
                value={newSecretData.name}
                onChange={(e) => setNewSecretData({ ...newSecretData, name: e.target.value })}
                placeholder="e.g., SUPABASE_SERVICE_ROLE_KEY"
                data-testid="input-secret-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret_value">Secret Value</Label>
              <Input
                id="secret_value"
                type="password"
                value={newSecretData.value}
                onChange={(e) => setNewSecretData({ ...newSecretData, value: e.target.value })}
                placeholder="Enter the secret value"
                data-testid="input-secret-value"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret_description">Description (optional)</Label>
              <Input
                id="secret_description"
                value={newSecretData.description}
                onChange={(e) => setNewSecretData({ ...newSecretData, description: e.target.value })}
                placeholder="What is this secret for?"
                data-testid="input-secret-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSecretDialog(false)} data-testid="button-cancel-secret">
              Cancel
            </Button>
            <Button 
              onClick={handleAddSecret} 
              disabled={savingSecret || !newSecretData.name.trim() || !newSecretData.value.trim()}
              data-testid="button-save-secret"
            >
              <Save className="h-4 w-4" />
              {savingSecret ? "Saving..." : "Save Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
