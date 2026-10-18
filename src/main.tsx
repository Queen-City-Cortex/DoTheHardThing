import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import App from './App'
import { t } from './copy'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="app"><main className="main"><section className="card">
        <h1>{t('error.hero')}</h1>
        <p className="muted">{t('error.reload')}</p>
        <div className="actions"><button className="primary" onClick={() => location.reload()}>{t('error.button')}</button></div>
      </section></main></div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
