import type { LLMProvider, LLMToolDefinition, LLMMessage, LLMCallResult, ToolCall } from "./types.ts";

/**
 * Map provider names to Vault secret names
 */
export const VAULT_KEY_MAPPING: Record<string, string> = {
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  google_ai: "GOOGLE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * Get vault key name for a provider
 */
export function getVaultKeyName(providerName: string): string {
  return VAULT_KEY_MAPPING[providerName.toLowerCase()] || `${providerName.toUpperCase()}_API_KEY`;
}

/**
 * Call OpenAI-compatible API (OpenAI, XAI)
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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
    usage: data.usage,
  });

  const toolCalls: ToolCall[] = choice?.message?.tool_calls || [];

  return {
    response: choice?.message?.content || "",
    toolCalls,
  };
}


/**
 * Conversation message for history
 */
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

  if (provider.name === "openai" || provider.name === "xai") {
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
    return callAnthropicWithHistory(apiKey, model, fullSystemPrompt, userMessage, tools, conversationHistory);
  }

  if (provider.name === "google_ai") {
    return callGoogleAIWithHistory(apiKey, model, fullSystemPrompt, userMessage, conversationHistory);
  }

  throw new Error(`Unsupported LLM provider: ${provider.name}`);
}

/**
 * Call Anthropic API with conversation history
 */
async function callAnthropicWithHistory(
  apiKey: string,
  model: string,
  systemPrompt: string | null,
  userMessage: string,
  tools?: LLMToolDefinition[],
  conversationHistory?: ConversationMessage[],
): Promise<LLMCallResult> {
  console.log("[LLM] Calling Anthropic API", { model, tool_count: tools?.length || 0, history_length: conversationHistory?.length || 0 });

  // Convert tools to Anthropic format
  const anthropicTools = tools?.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  // Build messages with history
  const messages: Array<{ role: string; content: string }> = [];
  
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  
  messages.push({ role: "user", content: userMessage });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt || undefined,
      messages,
      tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  console.log("[LLM] Anthropic response", {
    content_blocks: data.content?.length || 0,
    usage: data.usage,
  });

  let responseText = "";
  const toolCalls: ToolCall[] = [];

  for (const block of data.content || []) {
    if (block.type === "text") {
      responseText += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    response: responseText,
    toolCalls,
  };
}

/**
 * Call Google AI API with conversation history
 */
async function callGoogleAIWithHistory(
  apiKey: string,
  model: string,
  systemPrompt: string | null,
  userMessage: string,
  conversationHistory?: ConversationMessage[],
): Promise<LLMCallResult> {
  console.log("[LLM] Calling Google AI API", { model, history_length: conversationHistory?.length || 0 });

  // Build contents with history
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      contents.push({ 
        role: msg.role === "assistant" ? "model" : "user", 
        parts: [{ text: msg.content }] 
      });
    }
  }
  
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: systemPrompt
          ? { parts: [{ text: systemPrompt }] }
          : undefined,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  console.log("[LLM] Google AI response", {
    has_response: !!responseText,
    response_length: responseText.length,
  });

  return {
    response: responseText,
    toolCalls: [],
  };
}

/**
 * Call LLM with tool results to synthesize final response
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

  if (provider.name === "openai" || provider.name === "xai") {
    const baseUrl = provider.base_url || "https://api.openai.com/v1";
    const messages: LLMMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: `Current date: ${new Date().toDateString()}\n\n${systemPrompt}` });
    }
    messages.push({ role: "user", content: userMessage });

    // Add tool calls and results
    for (let i = 0; i < toolCalls.length; i++) {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [{
          id: toolCalls[i].id,
          type: "function",
          function: {
            name: toolCalls[i].function.name,
            arguments: toolCalls[i].function.arguments,
          },
        }],
      });
      messages.push({
        role: "tool",
        content: toolResults[i],
        tool_call_id: toolCalls[i].id,
      });
    }

    const result = await callOpenAI(baseUrl, apiKey, model, messages);
    return result.response;
  }

  if (provider.name === "anthropic") {
    // Anthropic uses different format for tool results
    const anthropicMessages = [
      { role: "user", content: userMessage },
      { 
        role: "assistant", 
        content: [{ 
          type: "tool_use", 
          id: toolCalls[0].id, 
          name: toolCalls[0].function.name, 
          input: JSON.parse(toolCalls[0].function.arguments || "{}") 
        }] 
      },
      { 
        role: "user", 
        content: [{ 
          type: "tool_result", 
          tool_use_id: toolCalls[0].id, 
          content: toolResults[0] 
        }] 
      },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt || undefined,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic synthesis error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let responseText = "";
    for (const block of data.content || []) {
      if (block.type === "text") {
        responseText = block.text;
      }
    }
    return responseText;
  }

  // Fallback for other providers
  return `Tool execution completed. Results: ${toolResults.join(", ")}`;
}

