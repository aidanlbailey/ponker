# PONKER 🎲

## About
PONKER is a web app intended to solve, or mitigate, the issue of "How much money do I have?" while playing poker. This tool is meant mainly for beginner Poker players who haven't quite gained a knack for keeping mental track of how much money their chips are worth, or how much they've lost/gained.

## Main Features
PONKER currently has a single main feature, and that's the chip counting interface. You can create "chips" assign them a value, color, and then increment a counter on each chip that will then multiply with the value of the chip to find a total value for the stack, and then the stack values are combined into a total value at the bottom of the screen.

## How to Use

### Getting Started
1. **Open PONKER** in your web browser
2. **Choose a preset** (optional) - Click the Menu (☰) → "Chip Presets" to load standard chip configurations:
   - **Standard Casino**: Traditional poker chip values ($1, $5, $10, $25, $100+)
   - **GMoney PennyPoker**: Low stakes setup (5¢, 10¢, 25¢)
   - **BMH "PettyPoker"**: Ultra-low stakes (1¢, 5¢, 10¢, 25¢)

### Managing Your Chips

#### Desktop/Laptop:
- **Add chips**: Click the "Add" button under any chip
- **Remove chips**: Click the "Remove" button under any chip
- **Change colors**: Click directly on a chip to open the color picker
- **Set values**: Click the dollar amount field and type a new value

#### Mobile/Touch Devices:
- **Add chips**: Swipe DOWN on a chip or tap "Add"
- **Remove chips**: Swipe UP on a chip or tap "Remove"  
- **Change colors**: LONG PRESS on a chip to open the color picker
- **Set values**: Tap the dollar amount field and type a new value

### Customizing Your Setup
- **Add new chip types**: Menu → "Add New Chip Type"
- **Delete chip types**: Click "Delete" on any chip (must have more than one chip type)
- **Change colors**: Use preset colors or the custom color picker
- **Set your name**: Menu → "Set Your Name" (included when sharing data)

### Sharing & Saving
- **Copy your setup**: Menu → "Copy Data" - copies your chip configuration to clipboard
- **Load someone else's setup**: Menu → "Paste Data" - paste shared chip data
- **Auto-save**: Your setup automatically saves and restores when you return

### Tips
- Your **total value** appears at the bottom of the screen
- You can **hide/show values** using the Menu if you want to practice chip recognition
- The app works offline once loaded
- **Haptic feedback** provides tactile responses on supported mobile devices

## Installation & Development

### Running Locally
```bash
# Clone the repository
git clone [repository-url]
cd ponker

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Tech Stack
- **React 19.1.0** - UI framework
- **Vite** - Build tool and development server
- **Pure CSS** - Styling with advanced animations
- **Local Storage** - Data persistence

## Features Overview
- ✅ **Chip Counter Interface** - Add/remove/customize chips
- ✅ **Touch Gestures** - Swipe and long-press controls for mobile
- ✅ **Color Customization** - Full color picker with poker chip presets
- ✅ **Preset Configurations** - Ready-made setups for different stakes
- ✅ **Data Sharing** - Copy/paste chip configurations
- ✅ **Responsive Design** - Works on desktop, tablet, and mobile
- ✅ **Auto-save** - Persistent data storage
- ✅ **Interactive Title** - Mouse-avoiding animated letters
- ✅ **Font Customization** - 20 different font options
- ✅ **Haptic Feedback** - Vibration responses on mobile

## Browser Support
PONKER works in all modern browsers including:
- Chrome/Chromium
- Firefox  
- Safari
- Edge

## Contributing
This is a personal project, but feedback and suggestions are welcome! Feel free to open issues or submit pull requests.

## License
Created by Aidan Bailey

---

**Version**: 1.whateverthefuck  
**Built with**: React & Vite