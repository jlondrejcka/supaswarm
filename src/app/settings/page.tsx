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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LLMProvider, ProviderModel } from "@/lib/supabase-types"
import { Settings, Key, Check, Save, Shield, Trash2, Plus, Lock, AlertCircle, ExternalLink } from "lucide-react"

const ENV_VAR_NAMES: Record<string, string> = {
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
}

const REQUIRED_SECRETS = [
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase Service Role Key",
    description: "Required for task processing. Find it in Supabase Dashboard > Project Settings > API",
    helpUrl: "https://supabase.com/dashboard/project/_/settings/api",
  },
  {
    name: "XAI_API_KEY",
    label: "xAI API Key",
    description: "For Grok models. Get it from x.ai",
    helpUrl: "https://x.ai",
  },
]

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
  
  const [quickSecretValues, setQuickSecretValues] = useState<Record<string, string>>({})
  const [savingQuickSecret, setSavingQuickSecret] = useState<string | null>(null)
  
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([])
  const [selectedModels, setSelectedModels] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchProviders()
    fetchVaultSecrets()
    fetchProviderModels()
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

  async function fetchProviderModels() {
    if (!supabase) return
    
    try {
      const { data, error } = await supabase
        .from("provider_models")
        .select("*")
        .order("model_name")
      
      if (error) throw error
      setProviderModels(data || [])
    } catch (error) {
      console.error("Failed to fetch provider models:", error)
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
    // Set selected models state from current provider models
    const models = providerModels.filter(m => m.provider_id === provider.id)
    const modelState: Record<string, boolean> = {}
    models.forEach(m => {
      modelState[m.id] = m.is_enabled || false
    })
    setSelectedModels(modelState)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!supabase || !selectedProvider) return

    setSaving(true)
    try {
      const envVarName = ENV_VAR_NAMES[selectedProvider.name] || `${selectedProvider.name.toUpperCase()}_API_KEY`
      
      if (formData.api_key.trim()) {
        const { error: vaultError } = await supabase.rpc("upsert_vault_secret", {
          secret_name: envVarName,
          secret_value: formData.api_key.trim(),
          secret_description: `API key for ${selectedProvider.display_name}`,
        })
        
        if (vaultError) throw vaultError
        
        await supabase
          .from("llm_providers")
          .update({ has_api_key: true })
          .eq("id", selectedProvider.id)
          
        setStatusMessage({ type: "success", text: `${envVarName} saved to Vault` })
      }

      const { error } = await supabase
        .from("llm_providers")
        .update({
          display_name: formData.display_name,
          default_model: formData.default_model,
          base_url: formData.base_url || null,
        })
        .eq("id", selectedProvider.id)

      if (error) throw error

      // Update model enabled states
      for (const [modelId, isEnabled] of Object.entries(selectedModels)) {
        await supabase
          .from("provider_models")
          .update({ is_enabled: isEnabled })
          .eq("id", modelId)
      }

      await fetchProviders()
      await fetchVaultSecrets()
      await fetchProviderModels()
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

  async function handleQuickSaveSecret(secretName: string, description: string) {
    if (!supabase) return
    const value = quickSecretValues[secretName]
    if (!value?.trim()) return
    
    setSavingQuickSecret(secretName)
    try {
      const { error } = await supabase.rpc("upsert_vault_secret", {
        secret_name: secretName,
        secret_value: value.trim(),
        secret_description: description,
      })
      
      if (error) throw error
      
      setStatusMessage({ type: "success", text: `${secretName} saved` })
      setQuickSecretValues(prev => ({ ...prev, [secretName]: "" }))
      await fetchVaultSecrets()
    } catch (error) {
      console.error("Failed to save secret:", error)
      setStatusMessage({ type: "error", text: "Failed to save secret" })
    } finally {
      setSavingQuickSecret(null)
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
  
  const missingRequiredSecrets = REQUIRED_SECRETS.filter(
    rs => !vaultSecrets.some(vs => vs.secret_name === rs.name)
  )

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

      {missingRequiredSecrets.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
              Required Setup
            </CardTitle>
            <CardDescription>
              Add these secrets to enable full functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {missingRequiredSecrets.map((secret) => (
              <div key={secret.name} className="space-y-2 p-4 rounded-md border bg-background">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <Label className="font-medium">{secret.label}</Label>
                    <p className="text-sm text-muted-foreground">{secret.description}</p>
                  </div>
                  {secret.helpUrl && (
                    <a 
                      href={secret.helpUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary flex items-center gap-1"
                    >
                      Get key <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Paste your key here"
                    value={quickSecretValues[secret.name] || ""}
                    onChange={(e) => setQuickSecretValues(prev => ({ ...prev, [secret.name]: e.target.value }))}
                    data-testid={`input-quick-${secret.name}`}
                  />
                  <Button
                    onClick={() => handleQuickSaveSecret(secret.name, secret.description)}
                    disabled={!quickSecretValues[secret.name]?.trim() || savingQuickSecret === secret.name}
                    data-testid={`button-save-${secret.name}`}
                  >
                    {savingQuickSecret === secret.name ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Configure {selectedProvider?.display_name}</DialogTitle>
            <DialogDescription className="text-xs">
              Update provider settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="display_name" className="text-xs">Display Name</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                data-testid="input-display-name"
              />
            </div>
            {selectedProvider && (
              <div className="space-y-2">
                <Label className="text-xs">Available Models</Label>
                <div className="border rounded-md p-2 space-y-1 max-h-[160px] overflow-y-auto">
                  {providerModels
                    .filter(m => m.provider_id === selectedProvider.id)
                    .sort((a, b) => (b.is_latest ? 1 : 0) - (a.is_latest ? 1 : 0))
                    .map((model) => (
                      <div key={model.id} className="flex items-center gap-2 py-1">
                        <Checkbox
                          id={`model-${model.id}`}
                          checked={selectedModels[model.id] || false}
                          onCheckedChange={(checked) => 
                            setSelectedModels(prev => ({ ...prev, [model.id]: !!checked }))
                          }
                          className="h-3.5 w-3.5"
                        />
                        <label htmlFor={`model-${model.id}`} className="text-xs cursor-pointer flex-1 flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{model.display_name || model.model_name}</span>
                          {model.is_latest && (
                            <span className="text-[9px] px-1 rounded bg-green-500/10 text-green-600">Latest</span>
                          )}
                          {model.supports_vision && (
                            <span className="text-[9px] px-1 rounded bg-blue-500/10 text-blue-500">Vision</span>
                          )}
                          <span className="text-muted-foreground">
                            {model.context_window && `${(model.context_window / 1000).toLocaleString()}K`}
                            {model.input_price_per_million != null && ` • $${model.input_price_per_million}/$${model.output_price_per_million}`}
                          </span>
                        </label>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="default_model" className="text-xs">Default Model</Label>
              <Select 
                value={formData.default_model} 
                onValueChange={(v) => setFormData({ ...formData, default_model: v })}
              >
                <SelectTrigger data-testid="select-default-model" className="h-8 text-sm">
                  <SelectValue placeholder="Select default model" />
                </SelectTrigger>
                <SelectContent>
                  {selectedProvider && providerModels
                    .filter(m => m.provider_id === selectedProvider.id && selectedModels[m.id])
                    .map((model) => (
                      <SelectItem key={model.id} value={model.model_name}>
                        {model.display_name || model.model_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="base_url" className="text-xs">Base URL</Label>
              <Input
                id="base_url"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="https://api.example.com/v1"
                data-testid="input-base-url"
                className="h-8 text-sm"
              />
            </div>

            {selectedProvider?.requires_api_key && (
              <div className="space-y-1">
                <Label htmlFor="api_key" className="flex items-center gap-2 text-xs">
                  <Shield className="h-3 w-3" />
                  API Key
                  {selectedProviderHasKey && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">Already configured</span>
                  )}
                </Label>
                <Input
                  id="api_key"
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder={selectedProviderHasKey ? "Enter new key to update" : "Enter your API key"}
                  data-testid="input-api-key"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Stored as <code className="bg-muted px-1 rounded">{envVarName}</code> in Vault
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
                placeholder="e.g., MY_API_KEY"
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
