import './rating.css'

// band edges, 50 apart round the 1,000 start. The bots seed from about 870 to 1,075
const EDGES = [900, 950, 1000, 1050, 1100, 1150]
export const tierOf = (rating: number) => EDGES.filter((edge) => rating >= edge).length

// null is someone still placing, they get the grey dashes
export function RatingBadge({ rating, size = 'sm' }: { rating: number | null; size?: 'sm' | 'md' | 'lg' }) {
  if (rating === null) {
    return (
      <span className={`rating rating-${size} rating-place`} title="Rating shows after a few more hands">
        ---
      </span>
    )
  }
  return (
    <span className={`rating rating-${size} rating-t${tierOf(rating)}`} title="Rating">
      {rating.toLocaleString('en-US')}
    </span>
  )
}
