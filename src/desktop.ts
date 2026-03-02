import { invoke } from '@tauri-apps/api/core'

export interface OpenFileResult {
  canceled?: boolean
  success?: boolean
  filePath?: string
  content?: string
  error?: string
}

export interface SaveFileResult {
  canceled?: boolean
  success?: boolean
  filePath?: string
  error?: string
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  // Tauri 2: __TAURI__ when withGlobalTauri is enabled; else __TAURI_INTERNALS__ is used by the API
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

export async function getEnv(key: string): Promise<string | null> {
  return invoke<string | null>('get_env', { key })
}

export async function openFile(): Promise<OpenFileResult> {
  return invoke<OpenFileResult>('open_file')
}

export async function saveFile(
  content: string,
  defaultPath?: string
): Promise<SaveFileResult> {
  return invoke<SaveFileResult>('save_file', { content, defaultPath })
}

// ----- App folder and file tree (for left sidebar) -----

export interface OpenAppFolderResult {
  canceled?: boolean
  path?: string
  error?: string
}

export async function openAppFolder(): Promise<OpenAppFolderResult> {
  return invoke<OpenAppFolderResult>('open_app_folder')
}

export interface DirEntry {
  name: string
  isDir: boolean
}

export async function appReadDir(dirPath: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>('app_read_dir', { dirPath })
}

export async function appReadTextFile(path: string): Promise<string> {
  return invoke<string>('app_read_text_file', { path })
}

export async function appWriteTextFile(path: string, content: string): Promise<void> {
  return invoke<void>('app_write_text_file', { path, content })
}

export async function appCreateDir(path: string, recursive?: boolean): Promise<void> {
  return invoke<void>('app_create_dir', { path, recursive: recursive ?? true })
}

export async function appRename(oldPath: string, newName: string): Promise<void> {
  return invoke<void>('app_rename', { oldPath, newName })
}

export async function appMove(fromPath: string, toDirPath: string): Promise<void> {
  return invoke<void>('app_move', { fromPath, toDirPath })
}

export async function appDelete(path: string, recursive?: boolean): Promise<void> {
  return invoke<void>('app_delete', { path, recursive: recursive ?? true })
}

/** Default workspace root for app folders (e.g. sample-project/tenant-a). */
export async function getDefaultWorkspaceRoot(): Promise<string> {
  return invoke<string>('get_default_workspace_root')
}

/** Ensure app folder exists with uiConfigs, workflows, app.manifest.json. Returns app root path. */
export async function ensureAppFolder(
  workspaceRoot: string,
  appFolderName: string,
  displayName: string
): Promise<string> {
  return invoke<string>('ensure_app_folder', {
    workspaceRoot,
    appFolderName,
    displayName,
  })
}

export interface GenerateOptions {
  stream?: boolean
  mode?: string
  includeSteps?: boolean
  /** Model/provider: openai, anthropic, google. */
  model?: string
}

export interface GenerateResponse {
  result?: string
  content?: string
  code?: string
  data?: unknown
}

const TEXT_KEYS = ['result', 'content', 'code', 'output', 'response', 'text', 'message', 'body'] as const

function getTextFromValue(v: unknown): string {
  if (typeof v === 'string' && v.trim()) return v
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    for (const key of TEXT_KEYS) {
      const val = o[key]
      if (typeof val === 'string' && val.trim()) return val
    }
  }
  return ''
}

/** Get first non-empty text from generate response. */
export function getGenerateResponseText(r: GenerateResponse): string {
  const top = getTextFromValue(r) || (r.result ?? r.content ?? r.code ?? '')
  if (top) return top
  return getTextFromValue(r.data) ?? ''
}

export async function generate(
  prompt: string,
  options?: GenerateOptions
): Promise<GenerateResponse> {
  return invoke<GenerateResponse>('api_generate', {
    prompt: prompt.trim(),
    stream: options?.stream ?? false,
    mode: options?.mode ?? 'generator',
    includeSteps: options?.includeSteps ?? false,
    model: options?.model ?? undefined,
  })
}
