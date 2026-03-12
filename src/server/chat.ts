/**
 * AI SDK chat API server. Serves POST /api/chat for useChat.
 * Uses API keys and model from request body (Builder settings).
 * Run with: npx tsx src/server/chat.ts (or node after build).
 *
 * Same-layout modification: when body.currentSpec is provided, the last user message
 * is rewritten with buildUserPrompt({ prompt, currentSpec }) so the model outputs
 * only RFC 6902 patches to apply to the existing spec (state is preserved).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Readable } from 'stream'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { buildUserPrompt, type Spec } from '@json-render/core'
import { catalog } from '../lib/json-render/catalog'

const PORT = Number(process.env.CHAT_SERVER_PORT) || 3030

function getSystemPrompt(): string {
  try {
    return catalog.prompt()
  } catch (e) {
    console.error('Catalog prompt failed, using fallback:', e)
    return 'You are a UI generator. Output JSON only.'
  }
}

type BuilderModelId = 'openai' | 'anthropic' | 'google'

const DEFAULT_MODEL_IDS: Record<BuilderModelId, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  google: 'gemini-2.0-flash',
}

/** Minimal spec shape for patch-only (refinement) mode. */
function isNonEmptySpec(spec: unknown): spec is { root: string; elements: Record<string, unknown> } {
  return (
    spec != null &&
    typeof spec === 'object' &&
    typeof (spec as { root?: unknown }).root === 'string' &&
    (spec as { elements?: unknown }).elements != null &&
    typeof (spec as { elements: unknown }).elements === 'object'
  )
}

interface ChatRequestBody {
  messages?: Array<{ role: string; content?: string; parts?: Array<{ type: string; text?: string }> }>
  model?: BuilderModelId
  openaiApiKey?: string
  claudeApiKey?: string
  googleApiKey?: string
  /** When set, last user message is rewritten for patch-only mode (output only patches). */
  currentSpec?: unknown
}

function getApiKey(model: BuilderModelId, body: ChatRequestBody): string | null {
  switch (model) {
    case 'openai':
      return body.openaiApiKey?.trim() || null
    case 'anthropic':
      return body.claudeApiKey?.trim() || null
    case 'google':
      return body.googleApiKey?.trim() || null
    default:
      return null
  }
}

function convertToModelMessages(
  messages: ChatRequestBody['messages']
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(messages)) return []
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    const role = m.role as 'system' | 'user' | 'assistant'
    if (!role || !['system', 'user', 'assistant'].includes(role)) continue
    let content = ''
    if (typeof m.content === 'string') content = m.content
    else if (Array.isArray(m.parts))
      content = m.parts.map((p) => (p.type === 'text' && p.text ? p.text : '')).join('')
    if (content) out.push({ role, content })
  }
  return out
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function sendError(res: ServerResponse, status: number, error: string) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS })
  res.end(JSON.stringify({ error }))
}

async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = ''
  for await (const chunk of req) body += chunk
  if (!body?.trim()) {
    sendError(res, 400, 'Empty request body')
    return
  }
  let parsed: ChatRequestBody
  try {
    parsed = JSON.parse(body) as ChatRequestBody
  } catch {
    sendError(res, 400, 'Invalid JSON body')
    return
  }

  const modelId = (parsed.model || 'openai') as BuilderModelId
  const apiKey = getApiKey(modelId, parsed)
  if (!apiKey) {
    sendError(res, 400, `Missing API key for model: ${modelId}. Add your API key in Builder Settings (Models).`)
    return
  }

  let modelMessages = convertToModelMessages(parsed.messages)
  if (modelMessages.length === 0) {
    sendError(res, 400, 'No messages')
    return
  }

  // Same-layout modification: if client sent currentSpec, ask model to output only patches
  const currentSpec = parsed.currentSpec
  if (isNonEmptySpec(currentSpec)) {
    const lastUser = modelMessages.filter((m) => m.role === 'user').pop()
    if (lastUser) {
      try {
        const refinementPrompt = buildUserPrompt({
          prompt: lastUser.content,
          currentSpec: currentSpec as Spec,
        })
        modelMessages = modelMessages.map((m) =>
          m === lastUser ? { ...m, content: refinementPrompt } : m
        )
      } catch (e) {
        console.error('[chat] buildUserPrompt failed:', e)
        // Continue with original messages
      }
    }
  }

  const systemPrompt =
    getSystemPrompt() +
    `

Output ONLY SpecStream: one JSON object per line. Each line is a single RFC 6902 patch. No other text or markdown.

When creating a new layout file (user asks for a new form or screen), start with exactly one line: {"@file":"uiConfigs/<name>.json"} where <name> matches the request (e.g. contact form -> contact.json, signup form -> sign-up.json, login -> login.json). Then output the JSONL patches for that file. This keeps file names stable (e.g. contact.json is not renamed when you later create another file).

Ops: add, remove, replace (need "value"); move, copy (need "from" and "path"); test (need "value").
Paths: /root, /elements/<id>, /elements/<id>/props, /elements/<id>/children, /state, /state/<path>.

Add /root first, then elements. Bind any editable value with { "$bindState": "/path" } (initial state is inferred). For every Button (and clickable component), add on.press with action "trackPress" and params { "id": "<element-id>", "label": "<button label>" } so the State panel shows the last action; use action "setState" with statePath and value to write custom state. When adding new elements, update the parent's children array. When the user message includes "CURRENT UI STATE", output only the patches for the requested change.`
  const messages = modelMessages.map((m) => ({ role: m.role, content: m.content }))

  let model: ReturnType<typeof createOpenAI> extends (id: string, opts?: unknown) => infer R ? R : never
  try {
    if (modelId === 'openai') {
      const openai = createOpenAI({ apiKey })
      model = openai(DEFAULT_MODEL_IDS.openai) as any
    } else if (modelId === 'anthropic') {
      const anthropic = createAnthropic({ apiKey })
      model = anthropic(DEFAULT_MODEL_IDS.anthropic) as any
    } else if (modelId === 'google') {
      const google = createGoogleGenerativeAI({ apiKey })
      model = google(DEFAULT_MODEL_IDS.google) as any
    } else {
      sendError(res, 400, `Unknown model: ${modelId}`)
      return
    }
  } catch (e) {
    const err = e as Error
    console.error('[chat] Model init failed:', err.message, err.stack)
    sendError(res, 500, err.message)
    return
  }

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
    })
    const response = result.toUIMessageStreamResponse()
    const headers = { ...CORS_HEADERS, ...Object.fromEntries(response.headers.entries()) }
    if (response.headers.has('content-type')) {
      (headers as Record<string, string>)['Content-Type'] = response.headers.get('content-type')!
    }
    res.writeHead(response.status ?? 200, headers)
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
      nodeStream.pipe(res)
    } else {
      res.end()
    }
  } catch (e) {
    const err = e as Error
    console.error('[chat] streamText or pipe failed:', err.message, err.stack)
    if (!res.headersSent) sendError(res, 500, err.message)
  }
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.writeHead(204)
    res.end()
    return
  }
  if (req.url === '/api/chat' && req.method === 'POST') {
    handlePost(req, res).catch((e) => {
      const err = e as Error
      console.error('[chat] handlePost error:', err.message, err.stack)
      if (!res.headersSent) sendError(res, 500, err.message)
    })
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => {
  console.log(`Builder chat API: http://localhost:${PORT}/api/chat`)
})
