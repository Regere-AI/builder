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
