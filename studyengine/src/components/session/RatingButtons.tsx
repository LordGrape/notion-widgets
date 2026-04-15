/*
 * RatingButtons Component
 * Again/Hard/Good/Easy rating buttons
 */


interface RatingButtonsProps {
  onRate: (rating: number) => void;
  disabled?: boolean;
  aiSuggested?: number | null;
}

const ratings = [
  { value: 1, label: 'Again' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Easy' }
];

export function RatingButtons({ onRate, disabled, aiSuggested }: RatingButtonsProps) {
  return (
    <div className="se-ratings">
      {ratings.map((rating) => {
        const isSuggested = aiSuggested === rating.value;
        return (
          <button
            key={rating.value}
            className={`se-rate ${isSuggested ? 'suggested' : ''}`.trim()}
            onClick={() => onRate(rating.value)}
            disabled={disabled}
            data-rate={rating.value}
          >
            <span className="rating-label">{rating.label}</span>
          </button>
        );
      })}
    </div>
  );
}
