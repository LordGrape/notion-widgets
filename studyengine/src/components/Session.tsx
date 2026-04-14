import { useSignal, useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { currentView, settings, dueItems, appState, persistState } from '../signals';
import type { StudyItem, Tier } from '../types';
import { scheduleFsrs } from '../logic/fsrs';
import { detectSupportedTiers } from '../logic/cards';
import { getCourseExamType } from '../logic/courses';
import { tierLabel, tierColour, tierFullName, fmtMMSS, esc } from '../utils/helpers';

interface SessionState {
  queue: StudyItem[];
  idx: number;
  xp: number;
  start: number;
  ratings: number[];
}

export function Session() {
  const session = useSignal<SessionState>({
    queue: [],
    idx: 0,
    xp: 0,
    start: Date.now(),
    ratings: []
  });
  const showAnswer = useSignal(false);
  const currentTier = useSignal<Tier>('quickfire');
  const itemCardRef = useRef<HTMLDivElement>(null);

  // Initialize session queue
  useEffect(() => {
    const items = dueItems.value.slice(0, settings.value.sessionLimit);
    // Assign tiers to each item
    const queueWithTiers = items.map(item => {
      const supported = detectSupportedTiers(item);
      const tier = supported[0] || 'quickfire';
      return { ...item, _presentTier: tier };
    });
    session.value = {
      ...session.value,
      queue: queueWithTiers
    };
    if (queueWithTiers.length > 0) {
      currentTier.value = detectSupportedTiers(queueWithTiers[0])[0] || 'quickfire';
    }
  }, []);

  const currentItem = useComputed(() => session.value.queue[session.value.idx]);
  const progress = useComputed(() => {
    const total = session.value.queue.length;
    const current = session.value.idx + 1;
    return { current, total, pct: total > 0 ? (current / total) * 100 : 0 };
  });

  const revealAnswer = () => {
    showAnswer.value = true;
  };

  const rateItem = (rating: number) => {
    const item = currentItem.value;
    if (!item) return;

    // Apply FSRS scheduling
    const result = scheduleFsrs(
      item,
      rating,
      Date.now(),
      true,
      settings.value.desiredRetention
    );

    // Update item in state
    appState.value.items[item.id] = item;
    persistState();

    // Update session
    const newRatings = [...session.value.ratings, rating];
    const newXP = session.value.xp + (rating * 10);

    if (session.value.idx + 1 >= session.value.queue.length) {
      // Session complete
      currentView.value = 'done';
    } else {
      session.value = {
        ...session.value,
        idx: session.value.idx + 1,
        xp: newXP,
        ratings: newRatings
      };
      const nextItem = session.value.queue[session.value.idx + 1];
      currentTier.value = detectSupportedTiers(nextItem)[0] || 'quickfire';
      showAnswer.value = false;
    }
  };

  const exitSession = () => {
    if (confirm('Exit this session? Your progress will be saved.')) {
      currentView.value = 'dashboard';
    }
  };

  if (!currentItem.value) {
    return (
      <div class="view active" id="viewSession">
        <div class="session-header">
          <div class="session-progress-stack">
            <span>No items due</span>
          </div>
          <button class="session-exit icon-only" onClick={exitSession}>✕</button>
        </div>
        <div class="item-card">
          <p>No items are due for review. Great job!</p>
          <button class="big-btn" onClick={() => { currentView.value = 'dashboard'; }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const item = currentItem.value;
  const tier = currentTier.value;
  const examType = getCourseExamType(item.course);

  return (
    <div class="view active" id="viewSession">
      <div class="session-header" id="sessionHeader">
        <div class="session-tier-pill">
          <span class="tiny" style={{ color: tierColour(tier) }}>●</span>
          <span id="sessionTierText">{tierLabel(tier)}</span>
        </div>
        <div class="session-progress-stack">
          <span id="sessionProgText">{progress.value.current} / {progress.value.total}</span>
          <div class="pbar">
            <div id="sessionProgBar" style={{ width: `${progress.value.pct}%` }} />
          </div>
        </div>
        <button class="session-exit icon-only" onClick={exitSession}>✕</button>
      </div>

      <div class="session-top">
        <div class="progress">
          <div class="p-text">
            <span id="progText">{progress.value.current} of {progress.value.total}</span>
            <span id="courseHint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '44%' }}>
              {item.course}
            </span>
          </div>
          <div class="pbar">
            <div id="progBar" style={{ width: `${progress.value.pct}%` }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
          <div
            class="tier-badge"
            id="tierBadge"
            style={{ background: tierColour(tier) }}
          >
            <span class="tiny">●</span> <span id="tierBadgeText">{tierLabel(tier)}</span>
          </div>
          <button class="session-exit" onClick={exitSession}>✕ Exit</button>
        </div>
      </div>

      <div class="timerbar" id="timerBar">
        <div id="timerFill" style={{ width: '0%' }} />
      </div>

      <div class="item-card" id="itemCard" ref={itemCardRef}>
        <div class="prompt" id="promptText">{item.prompt}</div>
        <div class="meta" id="metaRow">
          <span class="tag" id="metaCourse">{item.course}</span>
          <span class="tag" id="metaTopic">{item.topic || 'General'}</span>
        </div>

        <div id="tierArea">
          {!showAnswer.value && (
            <div class="panel">
              <div class="p-h">Your response</div>
              <textarea
                id="userText"
                rows={6}
                placeholder="Type your answer here..."
              />
              <div class="help">Press Space to reveal the answer</div>
              <button class="qa-btn" id="checkBtn" onClick={revealAnswer}>
                Reveal Answer (Space)
              </button>
              <button type="button" class="ghost-btn" id="dontKnowBtn">
                🤷 Don't know
              </button>
            </div>
          )}
        </div>

        {showAnswer.value && (
          <div class="answer" id="modelAnswer" style={{ display: 'block' }}>
            <div class="answer-label">Model Answer</div>
            <div dangerouslySetInnerHTML={{ __html: item.modelAnswer.replace(/\n/g, '<br/>') }} />
          </div>
        )}

        {showAnswer.value && (
          <div class="ratings" id="ratings" style={{ display: 'flex' }}>
            <button class="rate again" data-rate="1" onClick={() => rateItem(1)}>
              Again (1)<span class="rate-days">&lt; 10m</span>
            </button>
            <button class="rate hard" data-rate="2" onClick={() => rateItem(2)}>
              Hard (2)<span class="rate-days">~ 1d</span>
            </button>
            <button class="rate good" data-rate="3" onClick={() => rateItem(3)}>
              Good (3)<span class="rate-days">~ 3d</span>
            </button>
            <button class="rate easy" data-rate="4" onClick={() => rateItem(4)}>
              Easy (4)<span class="rate-days">~ 7d</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
