import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  // Default to standard casino preset
  const getInitialChips = () => {
    try {
      const saved = localStorage.getItem('ponker-chips')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (err) {
      console.error('Failed to load chips from localStorage:', err)
    }
    
    // Default to standard casino preset
    return {
      white: { count: 0, value: 1, color: '#ffffff' },
      red: { count: 0, value: 5, color: '#dc3545' },
      blue: { count: 0, value: 10, color: '#007bff' },
      green: { count: 0, value: 25, color: '#28a745' },
      black: { count: 0, value: 100, color: '#343a40' }
    }
  }

  const [chips, setChips] = useState(getInitialChips)

  // Generate random rotation values once and store them
  const [titleRotations] = useState(() => {
    return "PONKER".split('').map(() => ({
      start: (Math.random() - 0.5) * 6, // Random between -3 and 3 (more subtle)
      end: (Math.random() - 0.5) * 12 // Random between -6 and 6 (more subtle)
    }))
  })

  // Generate random fonts for letters (all using Georgia serif like P)
  const [letterFonts] = useState(() => {
    return "PONKER".split('').map((letter, index) => {
      // All letters use Georgia serif
      return { family: 'Georgia, "Times New Roman", serif', weight: 'bold' }
    })
  })

  const [presetsOpen, setPresetsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [animatingChips, setAnimatingChips] = useState({})
  const [addingChip, setAddingChip] = useState(null)
  const [removingChip, setRemovingChip] = useState(null)
  const [showTotalValue, setShowTotalValue] = useState(true)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const [longPressTimer, setLongPressTimer] = useState(null)
  const [isLongPress, setIsLongPress] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // Track which chip to delete
  const [colorPickerOpen, setColorPickerOpen] = useState(null) // Track which chip's color picker is open
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [letterOffsets, setLetterOffsets] = useState({}) // Track letter positions for mouse avoidance
  const [userName, setUserName] = useState(() => {
    try {
      return localStorage.getItem('ponker-user-name') || ''
    } catch (err) {
      return ''
    }
  })
  const [nameInputOpen, setNameInputOpen] = useState(false)
  const [nameInputEvaporating, setNameInputEvaporating] = useState(false)
  const [nameChangedNotification, setNameChangedNotification] = useState(false)
  const [originalNameBeforeEdit, setOriginalNameBeforeEdit] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [currentFontIndex, setCurrentFontIndex] = useState(() => {
    try {
      const savedFontIndex = localStorage.getItem('ponker-font-index')
      return savedFontIndex ? parseInt(savedFontIndex, 10) : 0
    } catch (err) {
      console.error('Failed to load font index from localStorage:', err)
      return 0
    }
  })
  const [fallingChips, setFallingChips] = useState([])
  const [risingChips, setRisingChips] = useState([])

  // Preset fonts for customization
  const presetFonts = [
    { name: 'Default', family: 'system-ui, -apple-system, sans-serif' },
    { name: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
    { name: 'Times', family: '"Times New Roman", Times, serif' },
    { name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
    { name: 'Helvetica', family: 'Helvetica, Arial, sans-serif' },
    { name: 'Courier', family: '"Courier New", Courier, monospace' },
    { name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
    { name: 'Trebuchet', family: '"Trebuchet MS", Arial, sans-serif' },
    { name: 'Comic Sans', family: '"Comic Sans MS", cursive' },
    { name: 'Impact', family: 'Impact, Arial Black, sans-serif' },
    { name: 'Palatino', family: 'Palatino, "Palatino Linotype", serif' },
    { name: 'Book Antiqua', family: '"Book Antiqua", Palatino, serif' },
    { name: 'Lucida', family: '"Lucida Grande", Lucida, sans-serif' },
    { name: 'Tahoma', family: 'Tahoma, Geneva, sans-serif' },
    { name: 'Century Gothic', family: '"Century Gothic", sans-serif' },
    { name: 'Franklin Gothic', family: '"Franklin Gothic Medium", sans-serif' },
    { name: 'Garamond', family: 'Garamond, serif' },
    { name: 'Brush Script', family: '"Brush Script MT", cursive' },
    { name: 'Papyrus', family: 'Papyrus, fantasy' },
    { name: 'Copperplate', family: 'Copperplate, fantasy' }
  ]

  const presets = [
    {
      id: 'gmoney-pennypoker',
      name: 'GMoney PennyPoker',
      author: 'Aidan',
      description: 'Low stakes penny poker setup',
      chips: {
        blue: { count: 0, value: 0.05, color: '#007bff' },
        green: { count: 0, value: 0.10, color: '#28a745' },
        black: { count: 0, value: 0.25, color: '#343a40' }
      }
    },
    {
      id: 'bmh-pettypoker',
      name: 'BMH "PettyPoker"',
      author: 'BMH',
      description: 'Literally PENNY Poker',
      chips: {
        blue: { count: 0, value: .01, color: '#007bff' },
        red: { count: 0, value: .05, color: '#dc3545' },
        green: { count: 0, value: .10, color: '#28a745' },
        black: { count: 0, value: .25, color: '#343a40' }
      }
    },
    {
      id: 'standard-casino',
      name: 'Standard poker chip values and colors',
      author: 'poker.org',
      description: 'Standard casino chip denominations with traditional colors',
      chips: {
        white: { count: 0, value: 1, color: '#ffffff' },
        red: { count: 0, value: 5, color: '#dc3545' },
        blue: { count: 0, value: 10, color: '#007bff' },
        green: { count: 0, value: 25, color: '#28a745' },
        black: { count: 0, value: 100, color: '#343a40' },
        purple: { count: 0, value: 500, color: '#6f42c1' },
        yellow: { count: 0, value: 1000, color: '#ffc107' },
        orange: { count: 0, value: 5000, color: '#fd7e14' },
        darkgreen: { count: 0, value: 25000, color: '#155724' },
        lightblue: { count: 0, value: 100000, color: '#17a2b8' }
      }
    }
  ]

  // Helper function to trigger haptic feedback on supported devices
  const triggerHaptic = (type) => {
    if (navigator.vibrate) {
      switch (type) {
        case 'light':
          navigator.vibrate(10)
          break
        case 'success':
          navigator.vibrate([50, 50, 50])
          break
        case 'error':
          navigator.vibrate([100, 50, 100])
          break
        default:
          navigator.vibrate(20)
      }
    }
  }

  // Minimum swipe distance for gesture recognition
  const minSwipeDistance = 50

  // localStorage helper functions
  const saveChipsToStorage = (chipsData) => {
    try {
      localStorage.setItem('ponker-chips', JSON.stringify(chipsData))
    } catch (err) {
      console.error('Failed to save chips to localStorage:', err)
    }
  }

  const savePresetToStorage = (presetId) => {
    try {
      localStorage.setItem('ponker-last-preset', presetId)
    } catch (err) {
      console.error('Failed to save preset to localStorage:', err)
    }
  }

  const saveUserNameToStorage = (name) => {
    try {
      localStorage.setItem('ponker-user-name', name)
    } catch (err) {
      console.error('Failed to save user name to localStorage:', err)
    }
  }

  const saveFontIndexToStorage = (fontIndex) => {
    try {
      localStorage.setItem('ponker-font-index', fontIndex.toString())
    } catch (err) {
      console.error('Failed to save font index to localStorage:', err)
    }
  }

  // Save chips to localStorage whenever chips change
  useEffect(() => {
    saveChipsToStorage(chips)
  }, [chips])

  // Save font index to localStorage whenever it changes
  useEffect(() => {
    saveFontIndexToStorage(currentFontIndex)
  }, [currentFontIndex])

  // Mouse avoidance effect for title letters
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    setMousePosition({ x: mouseX, y: mouseY })
    
    calculateLetterOffsets(rect, mouseX, mouseY)
  }

  // Touch avoidance effect for title letters (mobile)
  const handleTitleTouchMove = (e) => {
    e.preventDefault() // Prevent scrolling
    const rect = e.currentTarget.getBoundingClientRect()
    const touch = e.touches[0]
    const touchX = touch.clientX - rect.left
    const touchY = touch.clientY - rect.top
    setMousePosition({ x: touchX, y: touchY })
    
    calculateLetterOffsets(rect, touchX, touchY)
  }

  // Shared function to calculate letter offsets
  const calculateLetterOffsets = (rect, cursorX, cursorY) => {
    // Calculate offsets for each letter
    const newOffsets = {}
    const letters = document.querySelectorAll('.title-letter')
    
    letters.forEach((letter, index) => {
      const letterRect = letter.getBoundingClientRect()
      // Get the letter's original position (without any current offset)
      const originalLetterCenterX = letterRect.left + letterRect.width / 2 - rect.left
      const originalLetterCenterY = letterRect.top + letterRect.height / 2 - rect.top
      
      // Get current offset to calculate actual current position
      const currentOffset = letterOffsets[index] || { x: 0, y: 0 }
      const currentLetterCenterX = originalLetterCenterX + currentOffset.x
      const currentLetterCenterY = originalLetterCenterY + currentOffset.y
      
      const deltaX = cursorX - currentLetterCenterX
      const deltaY = cursorY - currentLetterCenterY
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      
      // Much more gentle avoidance effect with smoother easing
      const avoidanceRadius = 120 // Reduced from 200 to 120
      if (distance < avoidanceRadius && distance > 0) {
        // Use a smoother easing curve - cubic easing instead of linear
        const normalizedDistance = distance / avoidanceRadius
        const force = Math.pow(1 - normalizedDistance, 2) // Quadratic easing for smoother start
        const maxOffset = 12 // Slightly reduced from 15 to 12 pixels
        
        // Calculate the desired offset direction (away from cursor)
        const desiredOffsetX = -(deltaX / distance) * force * maxOffset
        const desiredOffsetY = -(deltaY / distance) * force * maxOffset
        
        // Gradually move toward the desired offset for smoother animation
        const lerpFactor = 0.3 // How quickly to interpolate (0.1 = slow, 1.0 = instant)
        const newOffsetX = currentOffset.x + (desiredOffsetX - currentOffset.x) * lerpFactor
        const newOffsetY = currentOffset.y + (desiredOffsetY - currentOffset.y) * lerpFactor
        
        newOffsets[index] = { x: newOffsetX, y: newOffsetY }
        
        // Debug logging for the first letter
        if (index === 0) {
          console.log(`Letter ${index}: distance=${distance.toFixed(1)}, force=${force.toFixed(2)}, offset=(${newOffsetX.toFixed(1)}, ${newOffsetY.toFixed(1)})`)
        }
      } else {
        // Gradually return to center when outside avoidance radius
        const returnLerpFactor = 0.15 // Slower return to center
        const newOffsetX = currentOffset.x * (1 - returnLerpFactor)
        const newOffsetY = currentOffset.y * (1 - returnLerpFactor)
        
        // Only set to exactly 0 if we're very close to avoid jitter
        newOffsets[index] = { 
          x: Math.abs(newOffsetX) < 0.1 ? 0 : newOffsetX, 
          y: Math.abs(newOffsetY) < 0.1 ? 0 : newOffsetY 
        }
      }
    })
    
    setLetterOffsets(newOffsets)
  }

  const handleMouseLeave = () => {
    // Reset all letter positions when mouse leaves
    setLetterOffsets({})
  }

  const handleTitleTouchEnd = () => {
    // Reset all letter positions when touch ends
    setLetterOffsets({})
  }

  // Handle touch start
  const handleTouchStart = (e, chipId) => {
    e.preventDefault() // Always prevent default on touch start
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientY)
    setIsLongPress(false)
    
    // Start long press timer
    const timer = setTimeout(() => {
      setIsLongPress(true)
      triggerHaptic('success') // Different haptic for long press
      // Open color picker modal
      setColorPickerOpen(chipId)
    }, 500) // 500ms for long press
    
    setLongPressTimer(timer)
  }

  // Handle touch move
  const handleTouchMove = (e) => {
    e.preventDefault() // Always prevent scrolling when touching chips
    setTouchEnd(e.targetTouches[0].clientY)
    
    // If user moves finger, cancel long press
    if (longPressTimer && touchStart) {
      const distance = Math.abs(touchStart - e.targetTouches[0].clientY)
      if (distance > 10) {
        clearTimeout(longPressTimer)
        setLongPressTimer(null)
      }
    }
  }

  // Handle touch end and determine swipe direction
  const handleTouchEnd = (chipId) => {
    // Clear long press timer
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
    
    // If it was a long press, don't do swipe actions
    if (isLongPress) {
      setIsLongPress(false)
      setTouchStart(null)
      setTouchEnd(null)
      return
    }
    
    if (!touchStart || !touchEnd) return
    
    const distance = touchStart - touchEnd
    const isUpSwipe = distance > minSwipeDistance
    const isDownSwipe = distance < -minSwipeDistance

    if (isUpSwipe) {
      removeChip(chipId) // Reversed: swipe up (away) removes chip
      triggerHaptic('light')
    } else if (isDownSwipe) {
      addChip(chipId) // Reversed: swipe down (towards you) adds chip
      triggerHaptic('light')
    }
    
    // Reset touch states
    setTouchStart(null)
    setTouchEnd(null)
  }

  // Helper function to trigger chip animations
  const triggerChipAnimation = (chipId, animationType) => {
    // Animation removed - keeping function for compatibility
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
    
    // On desktop (non-touch devices), open color picker on click
    if (!('ontouchstart' in window)) {
      setColorPickerOpen(chipId)
      triggerHaptic('light')
    }
  }

  const addChip = (chipId) => {
    // Create a falling chip animation
    const chip = chips[chipId]
    const fallingChipId = `falling-${Date.now()}-${Math.random()}`
    
    // Get the chip element's position
    const chipElement = document.querySelector(`[data-chip-id="${chipId}"]`)
    let left = '50%'
    let top = '0px'
    
    if (chipElement) {
      const rect = chipElement.getBoundingClientRect()
      // Calculate the correct offset based on screen size
      let animationChipSize = 120 // Default desktop size
      if (window.innerWidth <= 480) {
        animationChipSize = 70 // Mobile size
      } else if (window.innerWidth <= 768) {
        animationChipSize = 90 // Tablet size
      }
      const offset = animationChipSize / 2
      // Position the falling chip exactly at the center of the original chip
      left = `${rect.left + rect.width / 2 - offset}px`
      top = `${rect.top + rect.height / 2 - offset}px`
    }
    
    const newFallingChip = {
      id: fallingChipId,
      color: chip.color,
      value: chip.value,
      chipId: chipId,
      left: left,
      top: top
    }
    
    setFallingChips(prev => [...prev, newFallingChip])
    
    // Remove the falling chip after animation completes
    setTimeout(() => {
      setFallingChips(prev => prev.filter(fc => fc.id !== fallingChipId))
    }, 1000)
    
    // Update the actual chip count
    setChips(prev => ({
      ...prev,
      [chipId]: { ...prev[chipId], count: prev[chipId].count + 1 }
    }))
  }

  const removeChip = (chipId) => {
    const chip = chips[chipId]
    
    // Only animate if there are chips to remove
    if (chip.count > 0) {
      // Create a rising chip animation
      const risingChipId = `rising-${Date.now()}-${Math.random()}`
      
      // Get the chip element's position
      const chipElement = document.querySelector(`[data-chip-id="${chipId}"]`)
      let left = '50%'
      let top = '0px'
      
      if (chipElement) {
        const rect = chipElement.getBoundingClientRect()
        // Calculate the correct offset based on screen size
        let animationChipSize = 120 // Default desktop size
        if (window.innerWidth <= 480) {
          animationChipSize = 70 // Mobile size
        } else if (window.innerWidth <= 768) {
          animationChipSize = 90 // Tablet size
        }
        const offset = animationChipSize / 2
        // Position the rising chip exactly at the center of the original chip
        left = `${rect.left + rect.width / 2 - offset}px`
        top = `${rect.top + rect.height / 2 - offset}px`
      }
      
      const newRisingChip = {
        id: risingChipId,
        color: chip.color,
        value: chip.value,
        chipId: chipId,
        left: left,
        top: top
      }
      
      setRisingChips(prev => [...prev, newRisingChip])
      
      // Remove the rising chip after animation completes
      setTimeout(() => {
        setRisingChips(prev => prev.filter(rc => rc.id !== risingChipId))
      }, 1000)
    }
    
    // Update the actual chip count
    setChips(prev => ({
      ...prev,
      [chipId]: { ...prev[chipId], count: Math.max(0, prev[chipId].count - 1) }
    }))
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
  }

  const deleteChipType = (chipId) => {
    if (Object.keys(chips).length > 1) {
      setDeleteConfirm(chipId) // Show confirmation instead of deleting immediately
    }
  }

  const confirmDelete = (chipId) => {
    setRemovingChip(chipId)
    
    setTimeout(() => {
      setChips(prev => {
        const newChips = { ...prev }
        delete newChips[chipId]
        return newChips
      })
      setRemovingChip(null)
    }, 300)
    
    setDeleteConfirm(null) // Clear confirmation
    triggerHaptic('success')
  }

  const cancelDelete = () => {
    setDeleteConfirm(null)
    triggerHaptic('light')
  }

  const openColorPicker = (chipId) => {
    setColorPickerOpen(chipId)
    triggerHaptic('light')
  }

  const closeColorPicker = () => {
    setColorPickerOpen(null)
    triggerHaptic('light')
  }

  const handleColorChange = (chipId, color, shouldClose = true) => {
    updateChipColor(chipId, color)
    if (shouldClose) {
      setColorPickerOpen(null)
    }
    triggerHaptic('success')
  }

  const getTotalValue = () => {
    return Object.values(chips).reduce((total, chip) => total + (chip.count * chip.value), 0)
  }

  const loadPreset = (preset) => {
    setChips(preset.chips)
    setPresetsOpen(false)
    
    // Save the preset selection to localStorage
    savePresetToStorage(preset.id)
    
    triggerHaptic('success')
  }

  const togglePresets = () => {
    setPresetsOpen(!presetsOpen)
    triggerHaptic('light')
  }

  const toggleAbout = () => {
    setAboutOpen(!aboutOpen)
    triggerHaptic('light')
  }

  const toggleTotalValue = () => {
    setShowTotalValue(!showTotalValue)
    triggerHaptic('light')
  }

  const toggleNameInput = () => {
    if (nameInputOpen) {
      // Check if name changed before closing
      handleNameInputFinished()
      
      // Start evaporation effect before closing
      setNameInputEvaporating(true)
      setTimeout(() => {
        setNameInputOpen(false)
        setNameInputEvaporating(false)
      }, 300) // Match the CSS transition duration
    } else {
      // Store the original name when opening
      setOriginalNameBeforeEdit(userName)
      setNameInputOpen(true)
    }
    triggerHaptic('light')
  }

  const toggleMenu = () => {
    setMenuOpen(!menuOpen)
    triggerHaptic('light')
  }

  const closeMenu = () => {
    setMenuOpen(false)
    triggerHaptic('light')
  }

  const toggleDevPanel = () => {
    setFontMenuOpen(!fontMenuOpen)
    triggerHaptic('light')
  }

  const toggleFontMenu = () => {
    setFontMenuOpen(!fontMenuOpen)
    triggerHaptic('light')
  }

  const cycleFontForward = () => {
    const newIndex = (currentFontIndex + 1) % presetFonts.length
    setCurrentFontIndex(newIndex)
    triggerHaptic('light')
  }

  const cycleFontBackward = () => {
    const newIndex = (currentFontIndex - 1 + presetFonts.length) % presetFonts.length
    setCurrentFontIndex(newIndex)
    triggerHaptic('light')
  }

  const setFontByIndex = (index) => {
    setCurrentFontIndex(index)
    triggerHaptic('light')
  }

  const handleNameChange = (newName) => {
    setUserName(newName)
    saveUserNameToStorage(newName)
  }

  const handleNameInputFinished = () => {
    // Show notification if name actually changed from when the input was opened
    if (originalNameBeforeEdit !== userName && userName.trim() !== '') {
      setNameChangedNotification(true)
      setTimeout(() => {
        setNameChangedNotification(false)
      }, 3000) // Show for 3 seconds
    }
  }

  const copyToClipboard = async () => {
    const chipData = Object.entries(chips).map(([chipId, chip]) => {
      return `${chipId}: ${chip.count} chips @ $${chip.value.toFixed(2)} each (${chip.color})`
    }).join('\n')
    
    const totalValue = getTotalValue()
    const userNameLine = userName ? `Player: ${userName}\n` : ''
    const exportText = `PONKER Chip Data:\n${userNameLine}\n${chipData}\n\nTotal Value: $${totalValue.toFixed(2)}\n\nExported: ${new Date().toLocaleString()}`
    
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(exportText)
        const successMessage = userName ? `${userName}'s chip data copied to clipboard!` : 'Chip data copied to clipboard!'
        alert(successMessage)
        triggerHaptic('success')
      } else {
        // Fallback for older browsers or mobile devices
        fallbackCopyTextToClipboard(exportText)
      }
    } catch (err) {
      console.error('Failed to copy with modern API, trying fallback: ', err)
      // If modern API fails, try fallback
      fallbackCopyTextToClipboard(exportText)
    }
  }

  const fallbackCopyTextToClipboard = (text) => {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea')
    textArea.value = text
    
    // Make it invisible but still functional
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    textArea.style.opacity = '0'
    
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    
    try {
      // Use the older execCommand method
      const successful = document.execCommand('copy')
      if (successful) {
        const successMessage = userName ? `${userName}'s chip data copied to clipboard!` : 'Chip data copied to clipboard!'
        alert(successMessage)
        triggerHaptic('success')
      } else {
        throw new Error('execCommand copy failed')
      }
    } catch (err) {
      console.error('Fallback copy failed: ', err)
      // Last resort - show the text in a prompt for manual copy
      const message = 'Could not copy automatically. Please copy the text below manually:'
      alert(message)
      prompt('Copy this text:', text)
      triggerHaptic('error')
    } finally {
      document.body.removeChild(textArea)
    }
  }

  const loadFromClipboard = async () => {
    try {
      let text = ''
      
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText()
      } else {
        // Fallback for older browsers or mobile devices
        text = prompt('Paste your chip data here:') || ''
      }
      
      if (!text) {
        alert('No data to load')
        return
      }
      
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
    <div className="app" style={{ fontFamily: presetFonts[currentFontIndex].family }}>
      <div className="title-section">
        <h1 
          className="title"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchMove={handleTitleTouchMove}
          onTouchEnd={handleTitleTouchEnd}
        >
          {"PONKER".split('').map((letter, index) => {
            // Use the randomly generated fonts for each letter
            const letterStyle = {
              color: '#93c5fd',
              WebkitTextStroke: '3px #3b82f6',
              textShadow: '0 0 5px #3b82f6, 0 0 10px #3b82f6, 0 0 15px #3b82f6, 0 0 20px #1d4ed8',
              fontFamily: letterFonts[index].family,
              fontWeight: letterFonts[index].weight
            }
            
            // Get offset for this letter from mouse avoidance
            const offset = letterOffsets[index] || { x: 0, y: 0 }
            
            return (
              <span 
                key={index} 
                className="title-letter"
                style={{ 
                  animationDelay: `${Math.abs(index - 2.5) * 0.5}s`, // Strong ripple: N=0s, O/K=0.5s, P/E=1.0s, R=1.5s
                  '--start-rotation': `${titleRotations[index].start}deg`,
                  '--end-rotation': `${titleRotations[index].end}deg`,
                  '--mouse-offset-x': `${offset.x}px`,
                  '--mouse-offset-y': `${offset.y}px`,
                  transition: '--mouse-offset-x 0.4s ease-out, --mouse-offset-y 0.4s ease-out',
                  display: 'inline-block',
                  position: 'relative',
                  ...letterStyle
                }}
              >
                {letter}
              </span>
            );
          })}
        </h1>
        <p className="subtitle">by aidan bailey</p>
      </div>
      
      <div className="top-controls">
        <button onClick={toggleMenu} className="hamburger-btn">
          ☰ Menu
        </button>
      </div>

      {/* Hamburger Menu */}
      {menuOpen && (
        <div className="menu-overlay" onClick={closeMenu}>
          <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="menu-header">
              <h3>Menu</h3>
              <button onClick={closeMenu} className="close-menu-btn">✕</button>
            </div>
            
            <div className="menu-items">
              <button onClick={() => { addNewChipType(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">+</span>
                Add New Chip Type
              </button>
              
              <button onClick={() => { togglePresets(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">🎲</span>
                Chip Presets
              </button>
              
              <button onClick={() => { copyToClipboard(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">📋</span>
                Copy Data {userName && `(${userName})`}
              </button>
              
              <button onClick={() => { loadFromClipboard(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">📥</span>
                Paste Data
              </button>
              
              <button onClick={() => { toggleTotalValue(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">👁️</span>
                {showTotalValue ? 'Hide Values' : 'Show Values'}
              </button>
              
              <button onClick={() => { toggleNameInput(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">👤</span>
                {userName ? `Change Name (${userName})` : 'Set Your Name'}
              </button>
              
              <button onClick={() => { toggleAbout(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">ℹ️</span>
                About PONKER
              </button>
              
              <button onClick={() => { toggleFontMenu(); closeMenu(); }} className="menu-item">
                <span className="menu-icon">�</span>
                Font Style
              </button>
            </div>
          </div>
        </div>
      )}

      {presetsOpen && (
        <div className="presets-panel">
          <div className="presets-header">
            <h3>Chip Presets</h3>
            <button onClick={togglePresets} className="close-presets-btn">✕</button>
          </div>
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
          
          <div className="presets-footer">
            <div className="coming-soon-section">
              <p className="coming-soon-text">Coming soon!</p>
              <button 
                className="add-preset-btn"
                onClick={() => {
                  alert('Custom preset creation coming soon! For now, you can manually set up your chips and use the Copy Data feature to share your setup.')
                  triggerHaptic('light')
                }}
              >
                Add Your Own Preset
              </button>
            </div>
          </div>
        </div>
      )}
      
      {fontMenuOpen && (
        <div className="font-menu">
          <div className="font-menu-header">
            <h3>� Font Style</h3>
            <button onClick={toggleFontMenu} className="close-font-menu-btn">✕</button>
          </div>
          <div className="font-menu-content">
            <div className="current-font-info">
              <h4>Current Font: {presetFonts[currentFontIndex].name}</h4>
              <p className="font-family-display">{presetFonts[currentFontIndex].family}</p>
            </div>
            
            <div className="font-controls">
              <button onClick={cycleFontBackward} className="font-btn">
                ← Previous Font
              </button>
              <button onClick={cycleFontForward} className="font-btn">
                Next Font →
              </button>
            </div>
            
            <div className="font-grid">
              {presetFonts.map((font, index) => (
                <button
                  key={index}
                  onClick={() => setFontByIndex(index)}
                  className={`font-option ${index === currentFontIndex ? 'active' : ''}`}
                  style={{ fontFamily: font.family }}
                >
                  {font.name}
                </button>
              ))}
            </div>
            
            <div className="font-sample">
              <h4>Preview:</h4>
              <p style={{ fontFamily: presetFonts[currentFontIndex].family }}>
                The quick brown fox jumps over the lazy dog. 1234567890
              </p>
              <p style={{ fontFamily: presetFonts[currentFontIndex].family }}>
                PONKER Chip Counter - Add/Remove chips easily!
              </p>
            </div>
          </div>
        </div>
      )}
      
      {aboutOpen && (
        <div className="about-panel">
          <h3>About PONKER</h3>
          <div className="about-content">
            <p>
              PONKER is a simple and intuitive poker chip counter designed to help you keep track of your chip stacks during poker games.
            </p>
            
            <h4>Features:</h4>
            <ul>
              <li>Add and remove chips with animated feedback</li>
              <li>Customize chip colors by clicking on them</li>
              <li>Set custom values for each chip type</li>
              <li>Add or remove chip types as needed</li>
              <li>Copy and paste chip data for sharing</li>
              <li>Toggle between showing/hiding total values</li>
              <li>Preset configurations for common poker setups</li>
            </ul>
            
            <h4>How to Use:</h4>
            <ul>
              <li>Click "Add" to increase a chip count</li>
              <li>Click "Remove" to decrease a chip count</li>
              <li>Long press on a chip to change its color</li>
              <li>Swipe down on a chip to add one (mobile)</li>
              <li>Swipe up on a chip to remove one (mobile)</li>
              <li>Adjust the value field to set the monetary value</li>
              <li>Use "+ Chip" to add new chip types</li>
              <li>Use "Delete" to remove chip types (when you have more than one)</li>
            </ul>
            
            <div className="about-footer">
              <p><strong>Created by Aidan Bailey</strong></p>
              <p>Version 1.whateverthefuck - Built with React</p>
              {/* TODO: Add more about text here - this is where you can write additional content */}
              <div className="about-placeholder">
                <p><em></em></p>
                <p><em></em></p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {nameInputOpen && (
        <div className={`name-input-panel ${nameInputEvaporating ? 'evaporating' : ''}`}>
          <h3>Set Your Name</h3>
          <div className="name-input-content">
            <p>Your name will be included when you copy chip data to share with others.</p>
            <div className="name-input-container">
              <input
                type="text"
                value={userName}
                onChange={(e) => handleNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    toggleNameInput() // Same action as "Done" button
                  }
                }}
                placeholder="Enter your name..."
                className="name-input"
                maxLength={30}
                autoFocus
              />
            </div>
            <div className="name-input-buttons">
              <button 
                className="clear-name-btn"
                onClick={() => handleNameChange('')}
              >
                Clear
              </button>
              <button 
                className="close-name-btn"
                onClick={toggleNameInput}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete confirmation popup */}
      {deleteConfirm && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-popup">
            <h3>Delete Chip Type?</h3>
            <p>Are you sure you want to delete this chip type? This action cannot be undone.</p>
            <div className="delete-confirm-buttons">
              <button 
                className="cancel-btn"
                onClick={cancelDelete}
              >
                Cancel
              </button>
              <button 
                className="confirm-delete-btn"
                onClick={() => confirmDelete(deleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Color picker popup */}
      {colorPickerOpen && (
        <div className="color-picker-overlay" onClick={closeColorPicker}>
          <div className="color-picker-popup" onClick={(e) => e.stopPropagation()}>
            <h3>Choose Chip Color</h3>
            <div className="color-options">
              {/* Classic poker chip colors */}
              {[
                '#ffffff', // White ($1)
                '#dc3545', // Red ($5)
                '#007bff', // Blue ($10)
                '#28a745', // Green ($25)
                '#343a40', // Black ($100)
                '#6f42c1', // Purple ($500)
                '#ffc107', // Yellow ($1000)
                '#fd7e14', // Orange ($5000)
                '#155724', // Dark Green ($25000)
                '#17a2b8'  // Light Blue ($100000)
              ].map(color => (
                <button
                  key={color}
                  className="color-option"
                  style={{ backgroundColor: color }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleColorChange(colorPickerOpen, color, true) // Close on preset selection
                  }}
                  title={color}
                />
              ))}
            </div>
            <div className="color-picker-custom" onClick={(e) => e.stopPropagation()}>
              <label>Custom Color:</label>
              <input
                type="color"
                value={chips[colorPickerOpen]?.color || '#4a90e2'}
                onChange={(e) => {
                  e.stopPropagation()
                  handleColorChange(colorPickerOpen, e.target.value, false) // Don't close on change
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="custom-color-input"
              />
            </div>
            <button className="close-color-picker" onClick={closeColorPicker}>
              Close
            </button>
          </div>
        </div>
      )}
      
      <div className="chip-container">
        {Object.entries(chips).map(([chipId, chip]) => (
          <div 
            key={chipId} 
            className={`chip-section ${addingChip === chipId ? 'adding' : ''} ${removingChip === chipId ? 'removing' : ''}`}
            style={{ position: 'relative' }}
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
              className={`chip`}
              data-chip-id={chipId}
              style={{ 
                background: `linear-gradient(145deg, ${chip.color}, ${chip.color})`,
                color: getContrastColor(chip.color),
                position: 'relative',
                '--accent-color': chip.color === '#ffffff' ? '#0b289d' : '#ffffff'
              }}
              title="Click to change color (desktop) or long press (mobile), swipe down to add/swipe up to remove"
              onTouchStart={(e) => handleTouchStart(e, chipId)}
              onTouchMove={handleTouchMove}
              onTouchEnd={() => handleTouchEnd(chipId)}
              onClick={(e) => handleChipClick(chipId, e)}
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
                      backgroundColor: chip.color === '#ffffff' ? '#0b289d' : '#ffffff',
                      opacity: 0.7,
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-48px)`
                    }}
                  />
                ))}
              </div>
              
              <span className="chip-count" style={{ pointerEvents: 'none' }}>
                {chip.count}
              </span>
            </div>
            
            {/* Falling chip animations for this specific chip stack */}
            {fallingChips
              .filter(fc => fc.chipId === chipId)
              .map(fallingChip => (
                <div
                  key={fallingChip.id}
                  className="falling-chip"
                  style={{
                    left: fallingChip.left,
                    top: fallingChip.top,
                    background: `linear-gradient(145deg, ${fallingChip.color}, ${fallingChip.color}dd)`,
                    border: `3px solid #ffffff`,
                    boxShadow: `0 4px 8px rgba(0, 0, 0, 0.3)`
                  }}
                />
              ))}
            
            {/* Rising chip animations for this specific chip stack */}
            {risingChips
              .filter(rc => rc.chipId === chipId)
              .map(risingChip => (
                <div
                  key={risingChip.id}
                  className="rising-chip"
                  style={{
                    left: risingChip.left,
                    top: risingChip.top,
                    background: `linear-gradient(145deg, ${risingChip.color}, ${risingChip.color}dd)`,
                    border: `3px solid #ffffff`,
                    boxShadow: `0 4px 8px rgba(0, 0, 0, 0.3)`
                  }}
                />
              ))}
            

            <div className="chip-controls">
              <div className="value-input-container">
                <span className="dollar-sign">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={chip.value}
                  onChange={(e) => updateChipValue(chipId, e.target.value)}
                  onClick={(e) => {
                    // Only select all if the field was clicked (not focused via keyboard)
                    if (e.detail > 0) {
                      e.target.select();
                    }
                  }}
                  className="value-input"
                  style={{ 
                    width: `${Math.max(6, chip.value.toString().length + 2)}ch`, 
                    paddingLeft: '12px' 
                  }}
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
      
      {/* Name changed notification popup */}
      {nameChangedNotification && (
        <div className="name-changed-notification">
          <div className="notification-content">
            ✓ Name Changed!
          </div>
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
