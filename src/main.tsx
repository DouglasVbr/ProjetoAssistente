import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Framework7 from 'framework7/lite-bundle'
import Framework7React from 'framework7-react'
import 'framework7/css/bundle'
import './index.css'
import { App } from './presentation/App'
import { initSentry } from './core/monitoring/sentry'

// Registers framework7-react as a Framework7 plugin. This is what wires up
// framework7-react's internal event bus (f7events, via f7initEvents()) —
// without it, every framework7-react component that calls f7ready()
// internally (Navbar, Toolbar, ListItem, etc. via useTheme()) crashes with
// "Cannot read properties of undefined (reading 'once')", because f7events
// was never created. Wrapping the tree in framework7-react's own <App>
// component (done in App.tsx) creates the Framework7 *instance*, but only
// this Framework7.use() call registers the React integration itself — both
// are required. This was the actual cause of the black screen; the earlier
// <App> wrapper fix was necessary but not sufficient.
// `framework7/lite-bundle` pre-registers all Framework7 core components
// (Popup, Fab, etc.) so we don't need to import + .use() each one
// individually; `framework7/css/bundle` is its matching full stylesheet,
// which was missing entirely before (the app would have rendered unstyled
// even once the crash was fixed).
Framework7.use(Framework7React)

initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
