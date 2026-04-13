import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Wall } from './components/Wall'

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col h-full items-center justify-center text-ink/30 font-body text-sm">
      {label} — coming soon
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Wall />} />
        <Route path="/map" element={<Placeholder label="Map" />} />
        <Route path="/venues" element={<Placeholder label="Venues" />} />
        <Route path="/you" element={<Placeholder label="You" />} />
      </Routes>
    </BrowserRouter>
  )
}
