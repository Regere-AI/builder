import { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'
import { getLaunchpadSession, launchpadGetServiceSpec } from '@/services/api'

const INJECTED_PANEL_CLASS = 'api-spec-response-panel'

function ResponsePanel({ response, onClear }: { response: LastResponse; onClear: () => void }) {
  const bodyDisplay = (() => {
    try {
      const parsed = JSON.parse(response.body)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return response.body || '(empty)'
    }
  })()
  return (
    <div className={`${INJECTED_PANEL_CLASS} mt-3 rounded border border-[#3e3e3e] bg-[#252526] overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3e3e3e] bg-[#2d2d2d]">
        <span className="text-sm font-medium text-gray-200">
          Server response: <span className={response.status >= 200 && response.status < 300 ? 'text-green-400' : 'text-amber-400'}>{response.status} {response.statusText}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="px-2 py-1 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-[#3e3e3e] rounded transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="p-3">
        <div className="rounded bg-[#1e1e1e] border border-[#3e3e3e] overflow-auto max-h-[360px]">
          <pre className="p-3 text-sm text-[#d4d4d4] whitespace-pre-wrap break-all font-mono">
            {bodyDisplay}
          </pre>
        </div>
      </div>
    </div>
  )
}

function hasTypographicQuotes(s: string): boolean {
  return /[\u201C\u201D\u2018\u2019]/.test(s)
}
function normalizeQuotes(s: string): string {
  return s.replace(/\u201C|\u201D/g, '"').replace(/\u2018|\u2019/g, "'")
}

export interface LastResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

function parseViewerParams(): { slug: string; launchpadUrl: string } | null {
  const hash = window.location.hash
  if (!hash.startsWith('#api-spec-viewer')) return null
  const query = hash.slice(hash.indexOf('?') + 1)
  const params = new URLSearchParams(query)
  const slug = params.get('slug')
  const launchpadUrl = params.get('launchpadUrl')
  if (!slug || !launchpadUrl) return null
  return { slug, launchpadUrl }
}

export interface ApiSpecViewerProps {
  /** When provided (e.g. from editor tab), use these instead of URL hash. */
  slug?: string
  launchpadUrl?: string
}

export function ApiSpecViewer(props?: ApiSpecViewerProps) {
  const { slug: slugProp, launchpadUrl: launchpadUrlProp } = props ?? {}
  const [spec, setSpec] = useState<object | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [firstRecorded, setFirstRecorded] = useState<{ response: LastResponse; method: string; path: string } | null>(null)
  const pendingOpRef = useRef<{ method: string; path: string } | null>(null)
  const firstRecordedRef = useRef<typeof firstRecorded>(null)
  firstRecordedRef.current = firstRecorded
  /** Only accept a response as "first recorded" when it arrives after user clicked Execute. */
  const acceptNextResponseRef = useRef(false)

  useEffect(() => {
    const params =
      slugProp != null && launchpadUrlProp != null
        ? { slug: slugProp, launchpadUrl: launchpadUrlProp }
        : parseViewerParams()
    if (!params) {
      setError('Invalid spec viewer URL (missing slug or launchpadUrl)')
      setLoading(false)
      return
    }
    const session = getLaunchpadSession()
    if (!session || session.url.replace(/\/$/, '') !== params.launchpadUrl.replace(/\/$/, '')) {
      setError('Not logged in to this launchpad. Open the spec from the Service Registry in the main app.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    launchpadGetServiceSpec(params.launchpadUrl, params.slug, session.token)
      .then((json) => {
        setSpec(json)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [slugProp, launchpadUrlProp])

  const containerRef = useRef<HTMLDivElement>(null)
  const launchpadBaseRef = useRef<string | null>(null)
  useEffect(() => {
    const params =
      slugProp != null && launchpadUrlProp != null
        ? { slug: slugProp, launchpadUrl: launchpadUrlProp }
        : parseViewerParams()
    launchpadBaseRef.current = params ? params.launchpadUrl.replace(/\/$/, '') : null
  }, [slugProp, launchpadUrlProp])

  useEffect(() => {
    if (!spec || !launchpadBaseRef.current) return
    const base = launchpadBaseRef.current
    const originalFetch = window.fetch
    window.fetch = function (...args: Parameters<typeof fetch>) {
      const input = args[0]
      let method = 'GET'
      let url = ''
      if (typeof input === 'string') {
        url = input
        method = (args[1] as RequestInit)?.method?.toUpperCase() || 'GET'
      } else if (input && typeof input === 'object' && 'url' in input) {
        url = (input as Request).url
        method = ((input as Request).method || 'GET').toUpperCase()
      }
      return originalFetch.apply(this, args).then((res) => {
        const resUrl = res.url || url
        if (!resUrl.startsWith(base)) return res
        if (resUrl.endsWith('/spec') || resUrl.includes('/spec?')) return res
        let path = ''
        try {
          path = new URL(resUrl, base).pathname
        } catch {
          return res
        }
        const clone = res.clone()
        clone.text().then((body) => {
          if (!acceptNextResponseRef.current) return
          acceptNextResponseRef.current = false
          const headers: Record<string, string> = {}
          res.headers.forEach((v, k) => {
            headers[k] = v
          })
          setFirstRecorded({
            response: { status: res.status, statusText: res.statusText, headers, body },
            method,
            path,
          })
        }).catch(() => {})
        return res
      })
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [spec])

  // Capture first response from DOM when Swagger UI renders it (works when fetch/responseInterceptor don't run, e.g. in Tauri)
  useEffect(() => {
    if (!spec || !containerRef.current) return
    const container = containerRef.current
    const tryCaptureFromDom = () => {
      if (!acceptNextResponseRef.current || firstRecordedRef.current != null) return
      // Swagger UI renders response in .response-body or .live-response-body inside .opblock-body
      const selectors = [
        '.opblock-body .response-body',
        '.opblock-body .live-response-body',
        '.opblock-body .responses-inner pre',
        '.opblock-body .responses-inner .highlight-code',
        '.opblock-body .responses-inner',
        '.opblock-body .responses-wrapper',
      ]
      for (const sel of selectors) {
        const nodes = container.querySelectorAll(sel)
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i] as HTMLElement
          let bodyText = (node.tagName === 'PRE' || node.tagName === 'CODE' ? node.textContent : node.querySelector?.('pre, .highlight-code, code')?.textContent)?.trim() ?? ''
          if (!bodyText) bodyText = node.textContent?.trim()?.slice(0, 10000) ?? ''
          if (!bodyText || bodyText.length < 1) continue
          const opblock = node.closest('.opblock')
          if (!opblock) continue
          const methodEl = opblock.querySelector('.opblock-summary-method')
          const pathEl = opblock.querySelector('.opblock-summary-path')
          const method = (methodEl?.textContent?.trim() ?? '').toUpperCase() || (opblock.classList.contains('opblock-get') ? 'GET' : opblock.classList.contains('opblock-post') ? 'POST' : opblock.classList.contains('opblock-put') ? 'PUT' : opblock.classList.contains('opblock-delete') ? 'DELETE' : opblock.classList.contains('opblock-patch') ? 'PATCH' : 'GET')
          const path = pathEl?.textContent?.trim()?.replace(/\s+/g, '')?.replace(/\/$/, '') ?? ''
          const responseRow = node.closest('.response')
          const statusEl = responseRow?.querySelector('.response-col_status, td')
          const statusStr = statusEl?.textContent?.trim() ?? '200'
          const statusNum = parseInt(statusStr, 10) || 200
          acceptNextResponseRef.current = false
          setFirstRecorded({
            response: { status: statusNum, statusText: String(statusNum), headers: {}, body: bodyText },
            method,
            path,
          })
          return
        }
      }
    }
    const observer = new MutationObserver(() => {
      tryCaptureFromDom()
    })
    observer.observe(container, { childList: true, subtree: true, characterData: true, characterDataOldValue: false })
    const timeouts: ReturnType<typeof setTimeout>[] = []
    ;[300, 600, 1000, 2000, 3500].forEach((ms) => timeouts.push(setTimeout(tryCaptureFromDom, ms)))
    return () => {
      observer.disconnect()
      timeouts.forEach(clearTimeout)
    }
  }, [spec])

  // When user clicks Execute, accept the next response as "first recorded" and clear any previous
  useEffect(() => {
    const el = containerRef.current
    if (!el || !spec) return
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('button') ?? (e.target as HTMLElement)
      if (!target) return
      const inExecuteWrapper = target.closest?.('.execute-wrapper')
      const inOpblockBody = target.closest?.('.opblock-body')
      const isExecute = inExecuteWrapper && inOpblockBody && /execute/i.test(target.textContent ?? '')
      if (isExecute) {
        acceptNextResponseRef.current = true
        setFirstRecorded(null)
      }
    }
    el.addEventListener('click', onClick, true)
    return () => el.removeEventListener('click', onClick, true)
  }, [spec])

  const injectedRootRef = useRef<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement } | null>(null)
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const removeAllInjected = () => {
      if (injectedRootRef.current) {
        injectedRootRef.current.root.unmount()
        injectedRootRef.current = null
      }
      container.querySelectorAll(`.${INJECTED_PANEL_CLASS}`).forEach((el) => el.remove())
    }
    if (!firstRecorded) {
      removeAllInjected()
      return
    }
    const tryInject = () => {
      removeAllInjected()
      const { response, method: opMethod, path: opPath } = firstRecorded
      const opblocks = container.querySelectorAll('.opblock')
      const norm = (p: string) => p.replace(/\/$/, '').trim()
      const opPathNorm = norm(opPath)
      for (let i = 0; i < opblocks.length; i++) {
        const ob = opblocks[i]
        const methodEl = ob.querySelector('.opblock-summary-method')
        const pathEl = ob.querySelector('.opblock-summary-path')
        const method = methodEl?.textContent?.trim()?.toUpperCase() || (ob.classList.contains('opblock-get') ? 'GET' : ob.classList.contains('opblock-post') ? 'POST' : ob.classList.contains('opblock-put') ? 'PUT' : ob.classList.contains('opblock-delete') ? 'DELETE' : ob.classList.contains('opblock-patch') ? 'PATCH' : '')
        const domPath = norm(pathEl?.textContent?.trim()?.replace(/\s+/g, '') || '')
        const pathMatch = opPathNorm === domPath || (domPath && opPathNorm.endsWith(domPath)) || (domPath && domPath.endsWith(opPathNorm))
        if (method === opMethod && pathMatch) {
          const body = ob.querySelector('.opblock-body')
          if (!body) break
          const div = document.createElement('div')
          div.className = INJECTED_PANEL_CLASS
          body.appendChild(div)
          const root = createRoot(div)
          root.render(<ResponsePanel response={response} onClear={() => setFirstRecorded(null)} />)
          injectedRootRef.current = { root, container: div }
          return true
        }
      }
      return false
    }
    const injected = tryInject()
    const id = injected ? undefined : window.setTimeout(() => { tryInject() }, 200)
    return () => {
      if (id != null) clearTimeout(id)
      removeAllInjected()
    }
  }, [firstRecorded])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onInput = (e: Event) => {
      const target = e.target as HTMLTextAreaElement | HTMLElement
      if (!target) return
      if (target instanceof HTMLTextAreaElement && target.closest?.('.opblock-body')) {
        if (hasTypographicQuotes(target.value)) {
          const start = target.selectionStart ?? 0
          const end = target.selectionEnd ?? 0
          target.value = normalizeQuotes(target.value)
          target.setSelectionRange(start, end)
          target.dispatchEvent(new Event('input', { bubbles: true }))
        }
        return
      }
      if (target.isContentEditable && target.closest?.('.opblock-body')) {
        const text = target.textContent ?? ''
        if (hasTypographicQuotes(text)) {
          const normalized = normalizeQuotes(text)
          if (normalized !== text) {
            target.textContent = normalized
            target.dispatchEvent(new Event('input', { bubbles: true }))
          }
        }
      }
    }
    el.addEventListener('input', onInput, true)
    return () => el.removeEventListener('input', onInput, true)
  }, [spec != null])

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#1e1e1e] py-12 text-gray-400">
        Loading OpenAPI spec…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#1e1e1e] p-4">
        <div className="max-w-md text-center">
          <p className="font-medium text-red-400">{error}</p>
          <p className="mt-2 text-sm text-gray-500">
            Open the API spec from the docs icon in the Service Registry.
          </p>
        </div>
      </div>
    )
  }
  if (!spec) return null

  return (
    <div ref={containerRef} className="api-spec-viewer-dark h-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-[#1e1e1e]">
      {firstRecorded && (
        <div className="flex-none shrink-0 border-b border-[#3e3e3e] bg-[#252526] p-3">
          <ResponsePanel response={firstRecorded.response} onClear={() => setFirstRecorded(null)} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
      <style>{`
        .api-spec-viewer-dark .swagger-ui { background: #1e1e1e; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .topbar { background: #252526; }
        .api-spec-viewer-dark .swagger-ui .info { background: #252526; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .info .title { color: #e5e5e5; }
        .api-spec-viewer-dark .swagger-ui .info p, .api-spec-viewer-dark .swagger-ui .info span,
        .api-spec-viewer-dark .swagger-ui .info div { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .info a { color: #58a6ff; }
        .api-spec-viewer-dark .swagger-ui .info .link { color: #58a6ff; }
        .api-spec-viewer-dark .swagger-ui .info .version-stamp,
        .api-spec-viewer-dark .swagger-ui .info .info__version,
        .api-spec-viewer-dark .swagger-ui .info .version { background: #3e3e3e; color: #e5e5e5; border: 1px solid #505050; padding: 2px 8px; border-radius: 4px; display: inline-block; }
        .api-spec-viewer-dark .swagger-ui .info small,
        .api-spec-viewer-dark .swagger-ui .info .info__small { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .info .link,
        .api-spec-viewer-dark .swagger-ui .info a.link { background: #404040 !important; color: #e5e5e5 !important; border: 1px solid #505050; padding: 2px 8px; border-radius: 4px; }
        .api-spec-viewer-dark .swagger-ui .info .link:hover,
        .api-spec-viewer-dark .swagger-ui .info a.link:hover { color: #58a6ff !important; }
        .api-spec-viewer-dark .swagger-ui .info .information-container,
        .api-spec-viewer-dark .swagger-ui .info .info__contact { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .info .title + span,
        .api-spec-viewer-dark .swagger-ui .info .title + div span,
        .api-spec-viewer-dark .swagger-ui .info h2 span { color: #e5e5e5; background: #3e3e3e; border: 1px solid #505050; padding: 2px 8px; border-radius: 4px; }
        .api-spec-viewer-dark .swagger-ui .opblock { border-color: #3e3e3e; background: #2d2d2d; }
        .api-spec-viewer-dark .swagger-ui .opblock-summary { background: #2d2d2d; color: #d4d4d4; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .opblock-summary-path { color: #e5e5e5; }
        .api-spec-viewer-dark .swagger-ui .opblock-summary-description { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .opblock-summary-method { color: #e5e5e5; background: #404040; border: none; }
        .api-spec-viewer-dark .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #2d5a2d; color: #a3e0a3; }
        .api-spec-viewer-dark .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #2d4a5a; color: #a3d4e8; }
        .api-spec-viewer-dark .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #5a4a2d; color: #e8d4a3; }
        .api-spec-viewer-dark .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #5a2d2d; color: #e8a3a3; }
        .api-spec-viewer-dark .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #3d2d5a; color: #c4a3e8; }
        .api-spec-viewer-dark .swagger-ui .expand-operation .arrow { fill: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .expand-operation { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body { background: #2d2d2d; border-color: #3e3e3e; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .opblock-section-header { background: #333; color: #e5e5e5; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .opblock-section-header h4 { color: #e5e5e5; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .opblock-section-header label { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .table-container { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body p, .api-spec-viewer-dark .swagger-ui .opblock-body span,
        .api-spec-viewer-dark .swagger-ui .opblock-body div { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-tag { border-color: #3e3e3e; background: #252526; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-tag .arrow { fill: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-tag__name { color: #e5e5e5; }
        .api-spec-viewer-dark .swagger-ui .opblock-tag__description { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .opblock-tag-section { border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .opblock-tag-section .opblock-tag { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .table-container { background: #2d2d2d; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui table thead th { background: #333; color: #e5e5e5; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui table tbody td { color: #d4d4d4; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .parameter__name { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .parameter__type { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .response-col_status { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .response-col_description { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .tab { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .tab.active { color: #007acc; border-color: #007acc; }
        .api-spec-viewer-dark .swagger-ui .tab li { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui label { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui input, .api-spec-viewer-dark .swagger-ui select,
        .api-spec-viewer-dark .swagger-ui textarea { background: #3e3e3e; color: #e5e5e5; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .body-param__text,
        .api-spec-viewer-dark .swagger-ui .opblock-body textarea,
        .api-spec-viewer-dark .swagger-ui .opblock-body .body-param textarea { font-family: ui-monospace, "SF Mono", "Cascadia Code", "Consolas", monospace !important; font-feature-settings: "liga" 0, "calt" 0; }
        .api-spec-viewer-dark .swagger-ui .body-param__text[contenteditable],
        .api-spec-viewer-dark .swagger-ui .opblock-body [contenteditable="true"] { font-family: ui-monospace, "SF Mono", "Cascadia Code", "Consolas", monospace !important; font-feature-settings: "liga" 0, "calt" 0; }
        .api-spec-viewer-dark .swagger-ui .btn { background: #007acc; color: #fff; border-color: #007acc; }
        .api-spec-viewer-dark .swagger-ui .btn.cancel { background: transparent; color: #d4d4d4; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .model { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .model-toggle { color: #007acc; }
        .api-spec-viewer-dark .swagger-ui .prop-type { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .prop-name { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .markdown, .api-spec-viewer-dark .swagger-ui .markdown p,
        .api-spec-viewer-dark .swagger-ui .markdown code, .api-spec-viewer-dark .swagger-ui .markdown pre { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .markdown code, .api-spec-viewer-dark .swagger-ui pre { background: #2d2d2d; color: #d4d4d4; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .highlight-code { background: #2d2d2d; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .curl { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .scheme-container { background: #252526; border-color: #3e3e3e; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .section-title { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui h1, .api-spec-viewer-dark .swagger-ui h2, .api-spec-viewer-dark .swagger-ui h3,
        .api-spec-viewer-dark .swagger-ui h4 { color: #e5e5e5; }
        .api-spec-viewer-dark .swagger-ui .opblock-summary-method { color: #e5e5e5; }
        .api-spec-viewer-dark .swagger-ui .responses-inner h4, .api-spec-viewer-dark .swagger-ui .responses-inner p { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .response .response-col_status { color: #9cdcfe; }
        .api-spec-viewer-dark .swagger-ui .parameter__in { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .prop-attr { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .btn-group .btn { color: #fff; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .execute-wrapper .btn { color: #fff; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-table { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .response-col_description .markdown { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .parameter__name.required span { color: #e8a3a3; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .parameter__optional { color: #a3a3a3; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .body-param__text { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .try-out__btn { color: #fff; }
        .api-spec-viewer-dark .swagger-ui svg.arrow { fill: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-summary .arrow { fill: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .responses-wrapper { background: #2d2d2d; color: #d4d4d4; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .response-body { background: #1e1e1e !important; color: #d4d4d4 !important; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .response-body pre,
        .api-spec-viewer-dark .swagger-ui .response-body code,
        .api-spec-viewer-dark .swagger-ui .response-body .microlight { background: #1e1e1e !important; color: #d4d4d4 !important; }
        .api-spec-viewer-dark .swagger-ui .response-content { background: #2d2d2d; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-wrapper .response-body,
        .api-spec-viewer-dark .swagger-ui .opblock-body .response-body { background: #1e1e1e !important; color: #d4d4d4 !important; min-height: 60px; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response-body pre { color: #d4d4d4; background: #2d2d2d; padding: 12px; border-radius: 4px; overflow: auto; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response-body .highlight-code { color: #d4d4d4; background: #2d2d2d; }
        .api-spec-viewer-dark .swagger-ui .responses-inner .response-col_status { color: #9cdcfe; }
        .api-spec-viewer-dark .swagger-ui .responses-inner .response-col_description { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .responses-table .response-col_status { color: #9cdcfe; }
        .api-spec-viewer-dark .swagger-ui .responses-table .response-col_description { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .execute-wrapper { margin-top: 12px; }
        .api-spec-viewer-dark .swagger-ui .live-response { background: #2d2d2d; color: #d4d4d4; border: 1px solid #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui .live-response-body { background: #1e1e1e; color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .live-response-headers { background: #2d2d2d; color: #d4d4d4; border-color: #3e3e3e; }
        .api-spec-viewer-dark .swagger-ui [class*="response"] pre { background: #2d2d2d !important; color: #d4d4d4 !important; }
        .api-spec-viewer-dark .swagger-ui [class*="response"] code { color: #d4d4d4 !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner { display: block !important; overflow: visible !important; min-height: 0 !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response { display: block !important; margin-top: 12px; overflow: visible !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response-body { display: block !important; visibility: visible !important; opacity: 1 !important; min-height: 80px !important; overflow: visible !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-wrapper { overflow: visible !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-wrapper .response-body { max-height: none !important; height: auto !important; min-height: 80px !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body table.responses-table { display: table !important; width: 100%; }
        .api-spec-viewer-dark .swagger-ui .opblock-body table.responses-table td,
        .api-spec-viewer-dark .swagger-ui .opblock-body table.responses-table th { display: table-cell !important; padding: 8px; vertical-align: top; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response-body pre,
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response-body .highlight-code { display: block !important; min-height: 40px !important; white-space: pre-wrap; word-break: break-all; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner > * { display: block !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response th,
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response td { color: #d4d4d4; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-wrapper,
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner { flex: none !important; min-height: 0 !important; }
        .api-spec-viewer-dark .swagger-ui .opblock-body .response-body,
        .api-spec-viewer-dark .swagger-ui .opblock-body .responses-inner .response-body { flex: none !important; }
      `}</style>
      <div className="p-4">
        <SwaggerUI
          spec={spec}
          docExpansion="list"
          requestInterceptor={(req: { url?: string; method?: string }) => {
            const base = launchpadBaseRef.current
            if (base && req?.url && !String(req.url).endsWith('/spec') && !String(req.url).includes('/spec?')) {
              const urlStr = req.url
              if (urlStr.startsWith(base) || urlStr.startsWith('/') || urlStr.includes('/proxy/')) {
                try {
                  const path = urlStr.startsWith('http') ? new URL(urlStr).pathname : new URL(urlStr, base).pathname
                  pendingOpRef.current = { method: (req.method || 'GET').toUpperCase(), path }
                } catch {
                  pendingOpRef.current = null
                }
              }
            }
            return req
          }}
          responseInterceptor={(res: unknown) => {
            const r = res as { url?: string; clone?: () => { text(): Promise<string> }; text?(): Promise<string>; status?: number; statusText?: string; headers?: { forEach?(cb: (v: string, k: string) => void): void }; body?: string }
            const resUrl = r?.url ? String(r.url) : ''
            if (resUrl.endsWith('/spec') || resUrl.includes('/spec?')) return res as Response
            const pending = pendingOpRef.current
            pendingOpRef.current = null
            let path = ''
            try {
              path = resUrl ? new URL(resUrl, 'http://x').pathname : ''
            } catch {
              path = ''
            }
            const method = pending?.method ?? 'GET'
            const headers: Record<string, string> = {}
            if (r?.headers?.forEach) {
              r.headers.forEach((v: string, k: string) => { headers[k] = v })
            }
            const capture = (body: string) => {
              if (!acceptNextResponseRef.current) return
              acceptNextResponseRef.current = false
              setFirstRecorded({
                response: { status: r?.status ?? 0, statusText: r?.statusText ?? '', headers, body },
                method,
                path: path || (pending?.path ?? ''),
              })
            }
            const clone = r?.clone?.()
            if (typeof clone?.text === 'function') {
              clone.text().then(capture).catch(() => capture(''))
            } else if (typeof r?.text === 'function') {
              r.text().then(capture).catch(() => capture(''))
            } else if (typeof r?.body === 'string') {
              capture(r.body)
            } else {
              capture('')
            }
            return res as Response
          }}
        />
      </div>
      </div>
    </div>
  )
}
