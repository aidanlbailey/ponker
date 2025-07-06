import { useState } from 'react'
import './App.css'

function App() {
  const [chips, setChips] = useState({
    blue: { count: 0, value: 1, color: '#4a90e2' },
    green: { count: 0, value: 5, color: '#5cb85c' },
    black: { count: 0, value: 10, color: '#333333' }
  })

  const updateChipValue = (chipId, value) => {
    setChips(prev => ({
      ...prev,
      [chipId]: { ...prev[chipId], value: parseFloat(value) || 0 }
    }))
  }

  const updateChipColor = (chipId, color) => {
    setChips(prev => ({
      ...prev,
      [chipId]: { ...prev[chipId], color }
    }))
  }

  const handleChipClick = (chipId, event) => {
    // Stop the event from bubbling up
    event.stopPropagation()
  }

  const addChip = (chipId) => {
    setChips(prev => ({
      ...prev,
      [chipId]: { ...prev[chipId], count: prev[chipId].count + 1 }
    }))
  }

  const removeChip = (chipId) => {
    setChips(prev => ({
      ...prev,
      [chipId]: { ...prev[chipId], count: Math.max(0, prev[chipId].count - 1) }
    }))
  }

  const addNewChipType = () => {
    const chipId = `chip_${Date.now()}`
    setChips(prev => ({
      ...prev,
      [chipId]: {
        count: 0,
        value: 1,
        color: '#ff6b6b'
      }
    }))
  }

  const deleteChipType = (chipId) => {
    if (Object.keys(chips).length > 1) {
      setChips(prev => {
        const newChips = { ...prev }
        delete newChips[chipId]
        return newChips
      })
    }
  }

  const getTotalValue = () => {
    return Object.values(chips).reduce((total, chip) => total + (chip.count * chip.value), 0)
  }

  return (
    <div className="app">
      <h1 className="title">PONKER</h1>
      
      <button onClick={addNewChipType} className="add-chip-type-btn">
        + Chip
      </button>
      
      <div className="chip-container">
        {Object.entries(chips).map(([chipId, chip]) => (
          <div key={chipId} className="chip-section">
            <div className="chip-header">
              <span className="chip-name">${chip.value}</span>
              {Object.keys(chips).length > 1 && (
                <button 
                  className="delete-chip-btn"
                  onClick={() => deleteChipType(chipId)}
                  title="Delete chip type"
                >
                  Delete
                </button>
              )}
            </div>
            
            <div 
              className="chip"
              style={{ 
                background: `linear-gradient(145deg, ${chip.color}, ${chip.color}dd)`,
                color: getContrastColor(chip.color),
                position: 'relative'
              }}
              title="Click to change color"
            >
              {/* Edge rectangles for authentic poker chip look */}
              <div className="chip-spots">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="chip-spot"
                    style={{
                      position: 'absolute',
                      width: '16px',
                      height: '8px',
                      borderRadius: '2px',
                      backgroundColor: getContrastColor(chip.color),
                      opacity: 0.7,
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-48px)`
                    }}
                  />
                ))}
              </div>
              
              <span className="chip-count">{chip.count}</span>
              
              {/* Overlay color input that covers the entire chip */}
              <input
                type="color"
                value={chip.color}
                onChange={(e) => updateChipColor(chipId, e.target.value)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  border: 'none',
                  borderRadius: '50%'
                }}
                title="Click to change color"
              />
            </div>
            
            <div className="chip-controls">
              <div className="control-row">
                <label>Value: $</label>
                <input
                  type="number"
                  step="0.01"
                  value={chip.value}
                  onChange={(e) => updateChipValue(chipId, e.target.value)}
                  className="value-input"
                />
              </div>
            </div>
            
            <div className="chip-buttons">
              <button 
                className="add-btn"
                onClick={() => addChip(chipId)}
              >
                Add
              </button>
              <button 
                className="remove-btn"
                onClick={() => removeChip(chipId)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="total-value">
        Total Value: ${getTotalValue().toFixed(2)}
      </div>
    </div>
  )
}

// Helper function to determine if text should be white or black based on background color
function getContrastColor(hexColor) {
  const r = parseInt(hexColor.substr(1, 2), 16)
  const g = parseInt(hexColor.substr(3, 2), 16)
  const b = parseInt(hexColor.substr(5, 2), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#ffffff'
}

export default App
