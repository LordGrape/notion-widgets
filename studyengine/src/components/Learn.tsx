/*
 * Learn Component
 * Learn mode: prime → encode → consolidate → complete
 */

import { useCallback, useMemo, useState } from 'react';
import {
  learnSession,
  learnSegmentIndex,
  learnPhase,
  items,
  currentView,
  selectedCourse
} from '../signals';

type ConfidenceLevel = 1 | 2 | 3 | 4;

export function Learn() {
  const session = learnSession.value;
  const phase = learnPhase.value;
  const segmentIdx = learnSegmentIndex.value;
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);

  const phaseLabel = useMemo(() => phase.toUpperCase(), [phase]);

  const exitLearn = useCallback(() => {
    if (confirm('Exit learn mode? Your progress will be saved.')) {
      learnSession.value = null;
      currentView.value = 'dashboard';
    }
  }, []);

  const advance = useCallback(() => {
    if (!session) return;

    switch (phase) {
      case 'prime':
        learnPhase.value = 'encode';
        break;
      case 'encode':
        if (segmentIdx + 1 < session.segments.length) {
          learnSegmentIndex.value = segmentIdx + 1;
        } else {
          learnPhase.value = 'consolidate';
        }
        break;
      case 'consolidate':
        learnPhase.value = 'complete';
        break;
      case 'complete':
        learnSession.value = null;
        currentView.value = 'dashboard';
        break;
    }
  }, [phase, segmentIdx, session]);

  const getLearnableTopics = useCallback((courseName: string) => {
    const topics: Record<string, { name: string; cards: string[]; count: number }> = {};
    for (const id in items.value) {
      const it = items.value[id];
      if (!it || it.archived || it.course !== courseName) continue;
      const topicName = (it.topic || 'General').trim();
      if (!topics[topicName]) topics[topicName] = { name: topicName, cards: [], count: 0 };
      topics[topicName].cards.push(id);
      topics[topicName].count++;
    }
    return Object.values(topics).sort((a, b) => b.count - a.count);
  }, []);

  const startLearn = useCallback((topicName: string) => {
    const courseName = selectedCourse.value?.name;
    if (!courseName) return;

    const topicItems = Object.values(items.value).filter(
      it => it && !it.archived && it.course === courseName && (it.topic || 'General').trim() === topicName
    );

    const segments = topicItems.slice(0, 5).map((it, i) => ({
      id: it.id,
      content: it.prompt || 'Study this concept carefully.',
      title: it.topic || `Segment ${i + 1}`
    }));

    learnSession.value = {
      course: courseName,
      topics: [topicName],
      segments,
      currentSegmentIndex: 0,
      status: 'prime'
    };
    learnPhase.value = 'prime';
    learnSegmentIndex.value = 0;
    setConfidence(null);
  }, []);

  if (!session) {
    const courseName = selectedCourse.value?.name;
    const topics = courseName ? getLearnableTopics(courseName) : [];

    return (
      <div className="view view-learn active">
        <section className="se-learn">
          <div className="se-learn-card se-learn-intro">
            <h2>Learn Mode</h2>
            <p>Choose a topic to start a guided learning cycle.</p>
          </div>

          <div className="se-learn-topic-grid" role="list" aria-label="Learnable topics">
            {topics.map(topic => (
              <button
                key={topic.name}
                className="se-learn-topic-card"
                onClick={() => startLearn(topic.name)}
              >
                <span className="se-learn-topic-title">{topic.name}</span>
                <span className="se-learn-topic-count">{topic.count} cards</span>
              </button>
            ))}
          </div>

          <button className="ghost-btn" onClick={() => (currentView.value = 'dashboard')}>
            Back to Dashboard
          </button>
        </section>
      </div>
    );
  }

  const currentSegment = session.segments[segmentIdx];

  return (
    <div className="view view-learn active">
      <section className="se-learn">
        <header className="se-learn-header se-learn-card">
          <div>
            <h2>{session.course} — {session.topics[0]}</h2>
            <p>Guided flow: prime → encode → consolidate → complete</p>
          </div>
          <div className="se-learn-header-actions">
            <span className="se-learn-phase-pill">{phaseLabel}</span>
            <button className="ghost-btn" onClick={exitLearn}>Exit</button>
          </div>
        </header>

        {phase === 'prime' && (
          <div className="se-learn-card se-learn-phase-wrap">
            <h3>Prime your understanding</h3>
            <div className="se-learn-prompt">
              <p>What do you already know about <strong>{session.topics[0]}</strong>?</p>
              <p>What questions do you want answered by the end of this session?</p>
            </div>
            <button className="big-btn" onClick={advance}>Start Learning</button>
          </div>
        )}

        {phase === 'encode' && currentSegment && (
          <div className="se-learn-phase-wrap">
            <span className="se-learn-phase-pill se-learn-segment-pill">
              Segment {segmentIdx + 1} of {session.segments.length}
            </span>
            <article className="se-learn-card">
              <h3>{currentSegment.title}</h3>
              <p>{currentSegment.content}</p>
            </article>
            <div className="se-learn-prompt">
              <p>Reflection: What is the single most important idea in this segment?</p>
            </div>
            <button className="big-btn" onClick={advance}>
              {segmentIdx + 1 < session.segments.length ? 'Next Segment' : 'Continue to Consolidation'}
            </button>
          </div>
        )}

        {phase === 'consolidate' && (
          <div className="se-learn-phase-wrap">
            <div className="se-learn-card">
              <h3>Consolidate your understanding</h3>
              <p>Summarize the key concepts from {session.topics[0]} in your own words.</p>
            </div>
            <div className="se-learn-confidence-row" role="group" aria-label="Confidence rating">
              {[1, 2, 3, 4].map(level => (
                <button
                  key={level}
                  className={`se-learn-conf-btn${confidence === level ? ' active' : ''}`}
                  onClick={() => setConfidence(level as ConfidenceLevel)}
                >
                  {level}
                </button>
              ))}
            </div>
            <button className="big-btn" onClick={advance}>Complete Learning</button>
          </div>
        )}

        {phase === 'complete' && (
          <div className="se-learn-card se-learn-complete">
            <div className="se-learn-complete-emoji" role="img" aria-label="celebration">🎉</div>
            <h3>Learning Complete!</h3>
            <p>
              You completed the guided learning flow for {session.topics[0]}. Great work —
              continue to review to lock it in.
            </p>
            <button className="big-btn" onClick={advance}>Back to Dashboard</button>
          </div>
        )}
      </section>
    </div>
  );
}
