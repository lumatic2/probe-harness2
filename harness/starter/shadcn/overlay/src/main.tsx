import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DataState } from '@/components/data-state'

// Render before App's top-level data requests, so slow/failed connections never leave a blank page.
const root = createRoot(document.getElementById('root')!)
root.render(<main className="min-h-screen bg-background px-4 py-16"><DataState kind="loading" /></main>)
import('./App').then(({ default: App }) => root.render(<StrictMode><App /></StrictMode>)).catch((error: Error) => {
  root.render(<main className="min-h-screen bg-background px-4 py-16"><DataState kind="error" detail={error.message} retry={() => location.reload()} /></main>)
})
