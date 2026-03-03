/**
 * AI SDK chat API server. Serves POST /api/chat for useChat.
 * Uses API keys and model from request body (Builder settings).
 * Run with: npx tsx src/server/chat.ts (or node after build).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Readable } from 'stream'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
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

interface ChatRequestBody {
  messages?: Array<{ role: string; content?: string; parts?: Array<{ type: string; text?: string }> }>
  model?: BuilderModelId
  openaiApiKey?: string
  claudeApiKey?: string
  googleApiKey?: string
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

  const modelMessages = convertToModelMessages(parsed.messages)
  if (modelMessages.length === 0) {
    sendError(res, 400, 'No messages')
    return
  }

  const systemPrompt =
    getSystemPrompt() +
    `

Output ONLY SpecStream format: one JSON object per line. Each line must be a single JSON patch (RFC 6902) with "op", "path", and "value". No other text, no markdown, no explanation.

Example (output exactly like this, one line per object):
{"op":"add","path":"/root","value":"root-1"}
{"op":"add","path":"/elements/root-1","value":{"type":"Card","props":{"title":"Dashboard"},"children":["m1","m2"]}}
{"op":"add","path":"/elements/m1","value":{"type":"Text","props":{"content":"Hello"},"children":[]}}
{"op":"add","path":"/elements/m2","value":{"type":"Button","props":{"label":"Click"},"children":[]}}

Paths: /root for the root element id; /elements/<id> for each element. Build the UI by adding root first, then each element under /elements/<id>.`
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
