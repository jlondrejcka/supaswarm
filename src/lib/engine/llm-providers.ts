import type { LLMProvider, LLMToolDefinition, LLMMessage, LLMCallResult, ToolCall } from "./types";

/**
 * Map provider names to Vault secret names
 */
export const VAULT_KEY_MAPPING: Record<string, string> = {
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  google_ai: "GOOGLE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  ollama: "OLLAMA_LOCAL", // Local Ollama base URL
};

/**
 * Get vault key name for a provider
 */
export function getVaultKeyName(providerName: string): string {
  return VAULT_KEY_MAPPING[providerName.toLowerCase()] || `${providerName.toUpperCase()}_API_KEY`;
}

/**
 * Call OpenAI-compatible API (OpenAI, xAI, Ollama)
 */
async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  tools?: LLMToolDefinition[],
): Promise<LLMCallResult> {
  console.log("[LLM] Calling OpenAI-compatible API", {
    base_url: baseUrl,
    model,
    message_count: messages.length,
    tool_count: tools?.length || 0,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Only add Authorization header if API key is provided (not for Ollama)
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  console.log("[LLM] OpenAI response", {
    has_content: !!choice?.message?.content,
    has_tool_calls: !!choice?.message?.tool_calls,
    tool_call_count: choice?.message?.tool_calls?.length || 0,
  });

  const toolCalls: ToolCall[] = choice?.message?.tool_calls || [];

  return {
    response: choice?.message?.content || "",
    toolCalls,
  };
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Main function to call LLM provider with conversation history
 */
export async function callLLM(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  systemPrompt: string | null,
  userMessage: string,
  tools?: LLMToolDefinition[],
  conversationHistory?: ConversationMessage[],
): Promise<LLMCallResult> {
  const today = new Date().toDateString();
  const fullSystemPrompt = systemPrompt 
    ? `Current date: ${today}\n\n${systemPrompt}`
    : null;

  console.log("[LLM] Call with history", {
    history_length: conversationHistory?.length || 0,
    current_message_length: userMessage.length,
  });

  if (provider.name === "openai" || provider.name === "xai" || provider.name === "ollama") {
    const baseUrl = provider.base_url || "https://api.openai.com/v1";
    const messages: LLMMessage[] = [];
    
    if (fullSystemPrompt) {
      messages.push({ role: "system", content: fullSystemPrompt });
    }
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
    // Add current user message
    messages.push({ role: "user", content: userMessage });

    return callOpenAI(baseUrl, apiKey, model, messages, tools);
  }

  if (provider.name === "anthropic") {
    const messages: LLMMessage[] = [];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: userMessage });

    console.log("[LLM] Calling Anthropic API", {
      provider: provider.name,
      model,
      message_count: messages.length,
      tool_count: tools?.length || 0,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: fullSystemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: tools && tools.length > 0 ? tools : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    console.log("[LLM] Anthropic response", {
      has_content: !!data.content,
      content_count: data.content?.length || 0,
    });

    // Extract response content and tool use blocks
    let responseText = "";
    const toolCalls: ToolCall[] = [];
    let callId = 0;

    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === "text") {
          responseText += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id || String(callId++),
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          });
        }
      }
    }

    return {
      response: responseText,
      toolCalls,
    };
  }

  if (provider.name === "google" || provider.name === "google_ai") {
    const messages: LLMMessage[] = [];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: userMessage });

    console.log("[LLM] Calling Google AI API", {
      provider: provider.name,
      model,
      message_count: messages.length,
      tool_count: tools?.length || 0,
    });

    const systemInstruction = fullSystemPrompt
      ? { parts: [{ text: fullSystemPrompt }] }
      : undefined;

    const convertedMessages = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const requestBody: Record<string, unknown> = {
      contents: convertedMessages,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    if (tools && tools.length > 0) {
      requestBody.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          })),
        },
      ];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    console.log("[LLM] Google AI response", {
      has_content: !!data.candidates,
      candidate_count: data.candidates?.length || 0,
    });

    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error("No response from Google AI");
    }

    let responseText = "";
    const toolCalls: ToolCall[] = [];
    let callId = 0;

    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          responseText += part.text;
        } else if (part.functionCall) {
          toolCalls.push({
            id: String(callId++),
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }
      }
    }

    return {
      response: responseText,
      toolCalls,
    };
  }

  throw new Error(`Unsupported LLM provider: ${provider.name}`);
}

/**
 * Synthesize response from tool results
 */
export async function synthesizeResponse(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  systemPrompt: string | null,
  userMessage: string,
  toolCalls: ToolCall[],
  toolResults: string[],
): Promise<string> {
  console.log("[LLM] Synthesizing response from tool results", {
    provider: provider.name,
    tool_count: toolCalls.length,
  });

  // For now, return placeholder
  return `Tool execution completed. Results: ${toolResults.join(", ")}`;
}
