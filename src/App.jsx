import { useState } from 'react'
import './App.css'

function App() {
  const [chips, setChips] = useState({
    blue: { count: 0, value: 1, color: '#4a90e2' },
    green: { count: 0, value: 5, color: '#5cb85c' },
    black: { count: 0, value: 10, color: '#333333' }
  })

  const [colorPickerState, setColorPickerState] = useState({
    isOpen: false,
    chipId: null,
    position: { x: 0, y: 0 }
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
    const rect = event.currentTarget.getBoundingClientRect()
    const x = rect.right + 20 // Position to the right of the chip
    const y = rect.top + rect.height / 2
    
    setColorPickerState({
      isOpen: true,
      chipId,
      position: { x, y }
    })
    
    // Automatically trigger the color picker
    setTimeout(() => {
      const colorInput = document.getElementById(`hidden-color-${chipId}`)
      if (colorInput) {
        colorInput.click()
      }
    }, 0)
  }

  const closeColorPicker = () => {
    setColorPickerState({ isOpen: false, chipId: null, position: { x: 0, y: 0 } })
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
                color: getContrastColor(chip.color)
              }}
              onClick={(e) => handleChipClick(chipId, e)}
              title="Click to change color"
            >
              <span className="chip-count">{chip.count}</span>
            </div>
            
            {/* Hidden color input for each chip */}
            <input
              id={`hidden-color-${chipId}`}
              type="color"
              value={chip.color}
              onChange={(e) => updateChipColor(chipId, e.target.value)}
              style={{ 
                position: 'absolute',
                left: colorPickerState.chipId === chipId ? `${colorPickerState.position.x}px` : '-9999px',
                top: colorPickerState.chipId === chipId ? `${colorPickerState.position.y}px` : '-9999px',
                opacity: 0,
                pointerEvents: 'none'
              }}
            />
            
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
