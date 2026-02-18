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
  return typeof window !== 'undefined' && '__TAURI__' in window
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
