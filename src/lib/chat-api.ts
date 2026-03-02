/**
 * Chat API URL for AI SDK useChat. Uses Vite proxy when on dev server (port 5173)
 * so same-origin requests avoid CORS; otherwise full URL to chat server (e.g. Tauri).
 */
const CHAT_SERVER_PORT = 3030

export function getChatApiUrl(): string {
  if (typeof window === 'undefined') return ''
  const { hostname, port } = window.location
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '5173') {
    return '/api/chat'
  }
  return `http://localhost:${CHAT_SERVER_PORT}/api/chat`
}
