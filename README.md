# PONKER 🎲
![alt text](https://github.com/aidanlbailey/ponker/blob/main/Screenshot%202025-07-07%20131910.png "Logo Title Text 1")
## About
PONKER is a web app designed to solve, or mitigate, the issue of "How much money do I have?" while playing poker. This tool is intended primarily for beginner poker players who haven't quite developed a knack for mentally tracking how much money their chips are worth, or how much they've lost or gained.

## Project Background & Tech Stack
This is a personal project I developed to further familiarize myself with AI coding agents (like Cursor and Copilot) while gaining hands-on experience with JavaScript and CSS. The project utilizes modern web technologies to create a responsive and intuitive poker chip tracking application.

### Tech Stack
- **React 19.1.0** - UI framework for component-based architecture
- **Vite** - Lightning-fast build tool and development server
- **Pure CSS** - Custom styling with advanced animations and responsive design
- **Local Storage API** - Client-side data persistence
- **JavaScript ES6+** - Modern JavaScript features and syntax
- **Touch API** - Mobile gesture support (swipe, long-press)
- **Vibration API** - Haptic feedback for mobile devices

## Main Features
PONKER currently has a single main feature: the chip counting interface. You can create chip types assign them a value and color, and then increment a counter on each chip that multiplies with the chip's value to find a total value for the stack. The stack values are then combined into a total value displayed at the bottom of the screen.

## Features

### Core Functionality
- **Add and remove chips** with satisfying animated feedback
- **Customize chip colors** by clicking on them (desktop) or long pressing (mobile)
- **Set custom values** for each chip type
- **Add or remove chip types** as needed
- **Copy and paste chip data** for sharing with others
- **Toggle between showing/hiding total values**
- **Preset configurations** for common poker setups

### Enhanced User Experience
- **Three Theme Modes**:
  - **Dark Mode**: Classic dark theme with blue accents and glowing title
  - **Light Mode**: Clean light theme with dark accents and inverted title colors
  - **Felt Mode**: Authentic poker table green with felt texture and monochrome title
- **Smart Number Formatting**: Automatic comma separators for large numbers (e.g., 1,000 vs 1,000.50)
- **Flexible Total Display**: Choose to show total value at top (next to menu) or bottom
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Haptic Feedback**: Tactile feedback on supported mobile devices
- **Touch Gestures**: Swipe up/down on chips to add/remove (mobile)
- **Mouse Avoidance**: Interactive title letters that move away from cursor
- **Theme Persistence**: Your theme choice is remembered between sessions

### Customization Options
- **Font Selection**: Choose from 20+ different fonts
- **User Names**: Set your name for personalized data sharing
- **Chip Presets**: Pre-configured setups for different poker games
- **Color Customization**: Full color picker for each chip type

### Data Management
- **Local Storage**: All settings and chip data persist between sessions
- **Export/Import**: Copy chip data to clipboard or paste from clipboard
- **Preset Sharing**: Share your custom chip setups with others

## How to Use

### Getting Started
1. **Open PONKER** in your web browser
2. **Choose a preset** (optional) - Click the Menu (☰) → "Chip Presets" to load standard chip configurations:
   - **Standard Casino**: Traditional poker chip values ($1, $5, $10, $25, $100+)
   - **GMoney PennyPoker**: Low stakes setup (5¢, 10¢, 25¢) (Friend group preset)
   - **BMH "PettyPoker"**: Ultra-low stakes (1¢, 5¢, 10¢, 25¢) (Friend group preset)

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
- **Change theme**: Menu → Theme options (Dark/Light/Felt modes)
- **Customize fonts**: Menu → "Font Style" (20+ font options)
- **Move total value**: Menu → "Move Total to Top/Bottom"

### Sharing & Saving
- **Copy your setup**: Menu → "Copy Data" - copies your chip configuration to clipboard
- **Load someone else's setup**: Menu → "Paste Data" - paste shared chip data
- **Auto-save**: Your setup automatically saves and restores when you return

### Tips
- Your **total value** appears at the bottom of the screen (or top if you prefer)
- You can **hide/show values** using the Menu if you want to practice chip recognition
- The app works offline once loaded
- **Haptic feedback** provides tactile responses on supported mobile devices
- **Theme switching** is available in the menu - try all three modes!
- **Number formatting** automatically adds commas for better readability
- **Font customization** lets you personalize the app's appearance

## Installation & Development

### Running Locally
```bash
# Clone the repository
git clone https://github.com/aidanlbailey/ponker
cd ponker

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Features Overview
- ✅ **Chip Counter Interface** - Add/remove/customize chips with animated feedback
- ✅ **Touch Gestures** - Swipe and long-press controls for mobile
- ✅ **Color Customization** - Full color picker with poker chip presets
- ✅ **Preset Configurations** - Ready-made setups for different stakes
- ✅ **Data Sharing** - Copy/paste chip configurations
- ✅ **Responsive Design** - Works on desktop, tablet, and mobile
- ✅ **Auto-save** - Persistent data storage for all settings
- ✅ **Interactive Title** - Mouse-avoiding animated letters
- ✅ **Font Customization** - 20+ different font options
- ✅ **Haptic Feedback** - Vibration responses on mobile
- ✅ **Three Theme Modes** - Dark, Light, and Felt (poker table) themes
- ✅ **Smart Number Formatting** - Automatic comma separators for large numbers
- ✅ **Flexible Total Display** - Choose top or bottom total value position
- ✅ **User Names** - Personalized data sharing with custom names
- ✅ **Theme Persistence** - Theme preference saves between sessions
- ✅ **Enhanced Mobile UX** - Improved touch interactions and feedback

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

**Version**: 1.0.0
**Built with**: React & Vite
**Last Updated**: July 2025
