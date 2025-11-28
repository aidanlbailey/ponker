import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import ChipCounter from './components/ChipCounter'
import './App.css'

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chips" element={<ChipCounter />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App 