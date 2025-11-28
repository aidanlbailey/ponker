import { Link } from 'react-router-dom'
import '../App.css'

function Home() {
  return (
    <div className="home-container">
      <div className="home-content">
        <h1 className="home-title">PONKER</h1>
        <p className="home-subtitle">Professional Chip Counter</p>
        
        <div className="home-description">
          <p>Track your poker chips with precision and style.</p>
          <p>Perfect for home games, tournaments, and casino visits.</p>
        </div>

        <div className="home-features">
          <div className="feature">
            <span className="feature-icon">🎯</span>
            <span>Accurate counting</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🎨</span>
            <span>Customizable themes</span>
          </div>
          <div className="feature">
            <span className="feature-icon">💾</span>
            <span>Auto-save progress</span>
          </div>
          <div className="feature">
            <span className="feature-icon">📱</span>
            <span>Mobile optimized</span>
          </div>
        </div>

        <Link to="/chips" className="start-button">
          Start Counting
        </Link>
      </div>
    </div>
  )
}

export default Home 