import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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

// ----- Git CLI -----

export interface GitStatusEntry {
  path: string
  status: string
  indexStatus: string
  workTreeStatus: string
  staged: boolean
}

export interface GitStatusResult {
  entries: GitStatusEntry[]
  isRepo: boolean
}

/** Check if the given path is inside a git repository. */
export async function gitIsRepo(path: string): Promise<boolean> {
  return invoke<boolean>('git_is_repo', { path })
}

/** Get git status for the given repository path. */
export async function gitStatus(repoPath: string): Promise<GitStatusResult> {
  return invoke<GitStatusResult>('git_status', { repoPath })
}

/** Stage all changes and commit with the given message. */
export async function gitCommit(repoPath: string, message: string): Promise<void> {
  return invoke<void>('git_commit', { repoPath, message })
}

/** Stage specific files. Pass empty array to stage all. */
export async function gitAdd(repoPath: string, paths: string[]): Promise<void> {
  return invoke<void>('git_add', { repoPath, paths })
}

/** Unstage specific files. */
export async function gitReset(repoPath: string, paths: string[]): Promise<void> {
  return invoke<void>('git_reset', { repoPath, paths })
}

/** Commit only staged changes (no add -A). */
export async function gitCommitStaged(repoPath: string, message: string): Promise<void> {
  return invoke<void>('git_commit_staged', { repoPath, message })
}

/** Amend the last commit. Pass message to change it, or omit to keep. */
export async function gitCommitAmend(repoPath: string, message?: string): Promise<void> {
  return invoke<void>('git_commit_amend', { repoPath, message })
}

/** Push to upstream. */
export async function gitPush(repoPath: string): Promise<void> {
  return invoke<void>('git_push', { repoPath })
}

/** Discard changes for a file (restore modified, remove untracked). */
export async function gitDiscard(repoPath: string, path: string): Promise<void> {
  return invoke<void>('git_discard', { repoPath, path })
}

export interface GitDiffRange {
  startLine: number
  endLine: number
}

/** Get line ranges of modified/added lines in a file (working tree vs HEAD). */
export async function gitDiffFile(
  repoPath: string,
  filePath: string
): Promise<GitDiffRange[]> {
  return invoke<GitDiffRange[]>('git_diff_file', { repoPath, filePath })
}

/** Clone a git repository into the given target path. Returns the cloned path. */
export async function gitClone(repoUrl: string, targetPath: string): Promise<string> {
  return invoke<string>('git_clone', { repoUrl, targetPath })
}

/** Get the contents of a file at HEAD (for diff view). */
export async function gitShowFile(repoPath: string, filePath: string): Promise<string> {
  return invoke<string>('git_show_file', { repoPath, filePath })
}

// ----- File watching -----

/** Start watching a directory for file changes. Emits "file-changed" when files change. */
export async function watchDirectory(path: string): Promise<void> {
  return invoke<void>('watch_directory', { path })
}

/** Stop watching. */
export async function stopWatching(): Promise<void> {
  return invoke<void>('stop_watching')
}

/** Listen for file-changed events. Returns an unsubscribe function. */
export function listenFileChanged(
  callback: (event: { payload: string[] }) => void
): Promise<() => void> {
  return listen<string[]>('file-changed', (event) => {
    callback({ payload: event.payload })
  })
}

export interface GenerateOptions {
  stream?: boolean
  mode?: string
  includeSteps?: boolean
  /** Model/provider: openai, anthropic, google. */
  model?: string
// ----- Agent APIs (chat, modify, goal) -----
}


export interface MessagePart {
  type: string
  text: string
}

export interface ChatMessage {
  role: string
  parts: MessagePart[]
}

export interface ExecuteStep {
  id: string
  description: string
  intent: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  agentMode?: boolean
  planOnly?: boolean
  executePlan?: boolean
  currentUI?: unknown
  steps?: ExecuteStep[]
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

/** Get first non-empty text from chat/modify/goal response (generic object). */
export function getAgentResponseText(r: unknown): string {
  if (typeof r === 'string' && r.trim()) return r
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const top = getTextFromValue(r)
    if (top) return top
    const o = r as Record<string, unknown>
    const fromData = getTextFromValue(o.data)
    if (fromData) return fromData
    // Backend often returns { ui } without content; show the generated UI JSON
    const ui = o.ui
    if (ui != null && typeof ui === 'object') {
      try {
        return JSON.stringify(ui, null, 2)
      } catch {
        return 'UI generated.'
      }
    }
  }
  return ''
}

export async function chat(data: ChatRequest): Promise<unknown> {
  return invoke<unknown>('api_chat', {
    data: {
      messages: data.messages,
      agentMode: data.agentMode ?? false,
      planOnly: data.planOnly ?? false,
      executePlan: data.executePlan ?? false,
      currentUI: data.currentUI ?? null,
      steps: data.steps ?? null,
    },
  })
}

export interface ModifyRequest {
  prompt: string
}

export async function modify(data: ModifyRequest): Promise<unknown> {
  return invoke<unknown>('api_modify', { data })
}

export interface GoalRequest {
  goal: string
}

export async function goal(data: GoalRequest): Promise<unknown> {
  return invoke<unknown>('api_goal', { data })
}

/** Check if the agent backend is running and configured (OPENAI_API_KEY). */
export async function agentHealthCheck(): Promise<{ ok: boolean; configured?: boolean; message?: string }> {
  try {
    const data = await invoke<{ status?: string; configured?: boolean; hint?: string }>('api_agent_health')
    return {
      ok: data?.status === 'ok',
      configured: data?.configured,
      message: data?.hint,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}

/** True if the response looks like an empty layout (container with no children). */
export function isEmptyLayoutResponse(r: unknown): boolean {
  if (r == null || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  const ui = o.ui ?? o
  if (ui == null || typeof ui !== 'object') return false
  const u = ui as Record<string, unknown>
  const type = u.type as string
  const children = u.children
  if (type !== 'container' && type !== 'flex') return false
  return Array.isArray(children) && children.length === 0
}
