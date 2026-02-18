import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Suppress Monaco Editor dragEvent errors in webview
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.message?.includes('dragEvent') || event.message?.includes('ReferenceError: dragEvent')) {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
  }, true)

  // Also catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.message?.includes('dragEvent') || 
        event.reason?.toString()?.includes('dragEvent')) {
      event.preventDefault()
      return false
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
