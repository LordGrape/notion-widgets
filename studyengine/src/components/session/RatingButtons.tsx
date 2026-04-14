/*
 * RatingButtons Component
 * Again/Hard/Good/Easy rating buttons
 */

import { h } from 'preact';

interface RatingButtonsProps {
  onRate: (rating: number) => void;
  disabled?: boolean;
  aiSuggested?: number | null;
}

const ratings = [
  { value: 1, label: 'Again', color: '#ef4444' },
  { value: 2, label: 'Hard', color: '#f59e0b' },
  { value: 3, label: 'Good', color: '#22c55e' },
  { value: 4, label: 'Easy', color: '#3b82f6' }
];

export function RatingButtons({ onRate, disabled, aiSuggested }: RatingButtonsProps) {
  return (
    <div class="rating-buttons">
      {ratings.map((rating) => {
        const isSuggested = aiSuggested === rating.value;
        return (
          <button
            key={rating.value}
            class={`rating-btn ${isSuggested ? 'suggested' : ''}`}
            style={{ 
              borderColor: rating.color + '40',
              background: isSuggested ? rating.color + '15' : undefined
            }}
            onClick={() => onRate(rating.value)}
            disabled={disabled}
            data-rate={rating.value}
          >
            <span class="rating-label">{rating.label}</span>
          </button>
        );
      })}
    </div>
  );
}
