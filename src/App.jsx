import { useState, useEffect, useRef } from 'react'
import './App.css'

// Haptic feedback utility function
const triggerHaptic = (type = 'light') => {
  if (navigator.vibrate) {
    // Different vibration patterns for different feedback types
    switch (type) {
      case 'light':
        navigator.vibrate(10)
        break
      case 'medium':
        navigator.vibrate(25)
        break
      case 'heavy':
        navigator.vibrate([50, 20, 50])
        break
      case 'success':
        navigator.vibrate([100, 50, 100])
        break
      case 'error':
        navigator.vibrate([200, 100, 200, 100, 200])
        break
      default:
        navigator.vibrate(10)
    }
  }
}

function App() {
  const [chips, setChips] = useState({
    blue: { count: 0, value: 1, color: '#4a90e2' },
    green: { count: 0, value: 5, color: '#5cb85c' },
    black: { count: 0, value: 10, color: '#333333' }
  })

  const [presetsOpen, setPresetsOpen] = useState(false)
  const [animatingChips, setAnimatingChips] = useState({})
  const [addingChip, setAddingChip] = useState(null)
  const [removingChip, setRemovingChip] = useState(null)
  const [showTotalValue, setShowTotalValue] = useState(true)

  const presets = [
    {
      id: 'gmoney-pennypoker',
      name: 'GMoney PennyPoker',
      author: 'Aidan',
      description: 'Low stakes penny poker setup',
      chips: {
        blue: { count: 0, value: 0.05, color: '#4a90e2' },
        green: { count: 0, value: 0.10, color: '#5cb85c' },
        black: { count: 0, value: 0.25, color: '#333333' }
      }
    }
  ]

  // Helper function to trigger chip animations
  const triggerChipAnimation = (chipId, animationType) => {
    setAnimatingChips(prev => ({ ...prev, [chipId]: animationType }))
    setTimeout(() => {
      setAnimatingChips(prev => ({ ...prev, [chipId]: null }))
    }, animationType === 'bouncing' ? 400 : 300)
  }

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
    triggerChipAnimation(chipId, 'bouncing')
    triggerHaptic('light')
  }

  const removeChip = (chipId) => {
    setChips(prev => ({
      ...prev,
      [chipId]: { ...prev[chipId], count: Math.max(0, prev[chipId].count - 1) }
    }))
    triggerChipAnimation(chipId, 'pulsing')
    triggerHaptic('light')
  }

  const addNewChipType = () => {
    const chipId = `chip_${Date.now()}`
    setAddingChip(chipId)
    
    setChips(prev => ({
      ...prev,
      [chipId]: {
        count: 0,
        value: 1,
        color: '#ff6b6b'
      }
    }))
    
    setTimeout(() => setAddingChip(null), 500)
    triggerHaptic('medium')
  }

  const deleteChipType = (chipId) => {
    if (Object.keys(chips).length > 1) {
      setRemovingChip(chipId)
      
      setTimeout(() => {
        setChips(prev => {
          const newChips = { ...prev }
          delete newChips[chipId]
          return newChips
        })
        setRemovingChip(null)
      }, 300)
      triggerHaptic('heavy')
    }
  }

  const getTotalValue = () => {
    return Object.values(chips).reduce((total, chip) => total + (chip.count * chip.value), 0)
  }

  const loadPreset = (preset) => {
    setChips(preset.chips)
    setPresetsOpen(false)
    triggerHaptic('success')
  }

  const togglePresets = () => {
    setPresetsOpen(!presetsOpen)
    triggerHaptic('light')
  }

  const toggleTotalValue = () => {
    setShowTotalValue(!showTotalValue)
    triggerHaptic('light')
  }

  const copyToClipboard = async () => {
    const chipData = Object.entries(chips).map(([chipId, chip]) => {
      return `${chipId}: ${chip.count} chips @ $${chip.value.toFixed(2)} each (${chip.color})`
    }).join('\n')
    
    const totalValue = getTotalValue()
    const exportText = `PONKER Chip Data:\n\n${chipData}\n\nTotal Value: $${totalValue.toFixed(2)}\n\nExported: ${new Date().toLocaleString()}`
    
    try {
      await navigator.clipboard.writeText(exportText)
      alert('Chip data copied to clipboard!')
      triggerHaptic('success')
    } catch (err) {
      console.error('Failed to copy: ', err)
      alert('Failed to copy to clipboard')
      triggerHaptic('error')
    }
  }

  const loadFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      
      // Simple parsing - look for lines that match the pattern
      const lines = text.split('\n')
      const newChips = {}
      
      for (const line of lines) {
        // Match pattern: "chipId: count chips @ $value each (color)"
        const match = line.match(/^(\w+):\s*(\d+)\s*chips\s*@\s*\$?([\d.]+)\s*each\s*\(([^)]+)\)/)
        if (match) {
          const [, chipId, count, value, color] = match
          newChips[chipId] = {
            count: parseInt(count),
            value: parseFloat(value),
            color: color.startsWith('#') ? color : '#' + color.replace('#', '')
          }
        }
      }
      
      if (Object.keys(newChips).length > 0) {
        setChips(newChips)
        alert(`Loaded ${Object.keys(newChips).length} chip types from clipboard!`)
        triggerHaptic('success')
      } else {
        alert('No valid chip data found in clipboard')
        triggerHaptic('error')
      }
    } catch (err) {
      console.error('Failed to read clipboard: ', err)
      alert('Failed to read from clipboard')
      triggerHaptic('error')
    }
  }

  return (
    <div className="app">
      <div className="title-section">
        <h1 className="title">PONKER</h1>
        <p className="subtitle">by aidan bailey</p>
      </div>
      
      <div className="top-controls">
        <button onClick={addNewChipType} className="add-chip-type-btn">
          + Chip
        </button>
        
        <button onClick={togglePresets} className="presets-toggle-btn">
          {presetsOpen ? '← Presets' : 'Presets →'}
        </button>
        
        <button onClick={copyToClipboard} className="clipboard-btn">
          📋 Copy
        </button>
        
        <button onClick={loadFromClipboard} className="clipboard-btn">
          📥 Paste
        </button>
        
        <button onClick={toggleTotalValue} className="total-toggle-btn">
          {showTotalValue ? '👁️ Hide Values' : '👁️ Show Values'}
        </button>
      </div>

      {presetsOpen && (
        <div className="presets-panel">
          <h3>Chip Presets</h3>
          <div className="presets-list">
            {presets.map(preset => (
              <div key={preset.id} className="preset-card">
                <div className="preset-header">
                  <h4>{preset.name}</h4>
                  <span className="preset-author">by {preset.author}</span>
                </div>
                <p className="preset-description">{preset.description}</p>
                <div className="preset-chips-preview">
                  {Object.entries(preset.chips).map(([chipId, chip]) => (
                    <span key={chipId} className="preset-chip-info">
                      <span 
                        className="preset-chip-color" 
                        style={{ backgroundColor: chip.color }}
                      ></span>
                      ${chip.value.toFixed(2)}
                    </span>
                  ))}
                </div>
                <button 
                  className="load-preset-btn"
                  onClick={() => loadPreset(preset)}
                >
                  Load Preset
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="chip-container">
        {Object.entries(chips).map(([chipId, chip]) => (
          <div 
            key={chipId} 
            className={`chip-section ${addingChip === chipId ? 'adding' : ''} ${removingChip === chipId ? 'removing' : ''}`}
          >
            <div className="chip-header">
              {showTotalValue && (
                <span className="chip-name">${(chip.value * chip.count).toFixed(2)}</span>
              )}
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
              className={`chip ${animatingChips[chipId] || ''}`}
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
              
              <span className={`chip-count ${animatingChips[chipId] === 'bouncing' || animatingChips[chipId] === 'pulsing' ? 'changing' : ''}`}>
                {chip.count}
              </span>
              
              {/* Overlay color input that covers the entire chip */}
              <input
                type="color"
                value={chip.color}
                onChange={(e) => {
                  updateChipColor(chipId, e.target.value)
                  triggerHaptic('light')
                }}
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
      
      {showTotalValue && (
        <div className="total-value">
          Total Value: ${getTotalValue().toFixed(2)}
        </div>
      )}
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
