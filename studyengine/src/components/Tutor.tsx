// Tutor component - Socratic AI tutor dialogue
// Ported from studyengine/js/tutor.js

import { useSignal, useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { settings, appState } from '../signals';
import type { StudyItem, Tier } from '../types';
import { TUTOR_ENDPOINT, LECTURE_CTX_ENDPOINT } from '../signals';

interface TutorMessage {
  role: 'user' | 'tutor' | 'system';
  content: string;
  mode?: string;
}

interface TutorState {
  messages: TutorMessage[];
  turnCount: number;
  maxTurns: number;
  isLoading: boolean;
  mode: 'socratic' | 'acknowledge' | 'quickfeedback' | 'insight' | 'dontknow' | 'relearning';
}

interface TutorProps {
  item: StudyItem;
  userResponse: string;
  onComplete: () => void;
  onSkipToRating: () => void;
}

export function Tutor({ item, userResponse, onComplete, onSkipToRating }: TutorProps) {
  const state = useSignal<TutorState>({
    messages: [],
    turnCount: 0,
    maxTurns: 3,
    isLoading: false,
    mode: 'socratic'
  });
  const inputValue = useSignal('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize tutor session
  useEffect(() => {
    startTutorSession();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.value.messages]);

  const startTutorSession = async () => {
    state.value = { ...state.value, isLoading: true };
    
    try {
      const response = await callTutor('socratic', item, userResponse, [], {});
      
      const newMessage: TutorMessage = {
        role: 'tutor',
        content: response.feedback || response.response || "Let's work through this together.",
        mode: 'socratic'
      };
      
      state.value = {
        ...state.value,
        messages: [newMessage],
        turnCount: 1,
        isLoading: false
      };
    } catch (error) {
      state.value = {
        ...state.value,
        messages: [{ role: 'tutor', content: 'Let me help you understand this better.', mode: 'socratic' }],
        isLoading: false
      };
    }
  };

  const submitResponse = async () => {
    if (!inputValue.value.trim() || state.value.isLoading) return;
    
    const userMsg: TutorMessage = { role: 'user', content: inputValue.value };
    const newMessages = [...state.value.messages, userMsg];
    
    state.value = {
      ...state.value,
      messages: newMessages,
      isLoading: true
    };
    inputValue.value = '';
    
    try {
      const response = await callTutor(
        state.value.mode,
        item,
        userMsg.content,
        newMessages,
        {}
      );
      
      const tutorMsg: TutorMessage = {
        role: 'tutor',
        content: response.feedback || response.response || 'Good effort! Keep going.',
        mode: response.mode || state.value.mode
      };
      
      const newTurnCount = state.value.turnCount + 1;
      
      state.value = {
        ...state.value,
        messages: [...newMessages, tutorMsg],
        turnCount: newTurnCount,
        isLoading: false,
        mode: (response.mode as TutorState['mode']) || state.value.mode
      };
      
      if (newTurnCount >= state.value.maxTurns) {
        setTimeout(onComplete, 500);
      }
    } catch (error) {
      state.value = {
        ...state.value,
        messages: [...newMessages, { role: 'tutor', content: 'Good effort! Let\'s move on.', mode: 'acknowledge' }],
        isLoading: false
      };
    }
  };

  const handleSkip = () => {
    onSkipToRating();
  };

  return (
    <div class="tutor-container">
      <div class="tutor-header">
        <span class="tutor-icon">🎓</span>
        <span class="tutor-title">AI Tutor</span>
        <span class="tutor-turn">Turn {state.value.turnCount} of {state.value.maxTurns}</span>
      </div>
      
      <div class="tutor-messages" id="tutorMessages">
        {state.value.messages.map((msg, idx) => (
          <div key={idx} class={`tutor-message ${msg.role}`}>
            <div class="tutor-message-content">{msg.content}</div>
          </div>
        ))}
        {state.value.isLoading && (
          <div class="tutor-message tutor">
            <div class="tutor-typing">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div class="tutor-input-row">
        <textarea
          id="tutorInput"
          placeholder="Type your response..."
          rows={2}
          value={inputValue.value}
          onInput={(e) => { inputValue.value = (e.target as HTMLTextAreaElement).value; }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitResponse();
            }
          }}
        />
        <button 
          type="button" 
          class="send-btn" 
          onClick={submitResponse}
          disabled={state.value.isLoading}
        >
          →
        </button>
      </div>
      
      <div class="tutor-footer">
        <button type="button" class="skip-btn" onClick={handleSkip}>
          Skip to Rating →
        </button>
      </div>
    </div>
  );
}

async function callTutor(
  mode: string,
  item: StudyItem,
  userResponse: string,
  conversation: TutorMessage[],
  context: Record<string, unknown>
): Promise<{ feedback?: string; response?: string; mode?: string }> {
  const model = settings.value.modelOverride || 'flash';
  
  const payload = {
    mode,
    model,
    item: {
      prompt: item.prompt || '',
      modelAnswer: item.modelAnswer || '',
      tier: (item as { _presentTier?: Tier })._presentTier || item.tier || 'explain',
      course: item.course || '',
      topic: item.topic || '',
      conceptA: item.conceptA,
      conceptB: item.conceptB,
      task: item.task
    },
    userName: settings.value.userName || 'Student',
    tutorVoice: settings.value.tutorVoice === 'supportive' ? 'supportive' : 'rigorous',
    userResponse,
    conversation: conversation.map(m => ({ role: m.role, content: m.content })),
    context
  };
  
  // Fetch lecture context if available
  let lectureContext: { courseDigest?: string; topicChunk?: string } | undefined;
  
  if (item.course) {
    const courseData = appState.value.courses[item.course];
    if (courseData?.syllabusContext) {
      lectureContext = { courseDigest: courseData.syllabusContext };
    }
    
    if (item.topic) {
      try {
        const ctxResponse = await fetch(LECTURE_CTX_ENDPOINT, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Widget-Key': getWidgetKey()
          },
          body: JSON.stringify({ courseName: item.course, topic: item.topic })
        });
        const ctxData = await ctxResponse.json();
        if (ctxData?.topicChunk?.content) {
          lectureContext = { 
            ...lectureContext, 
            topicChunk: ctxData.topicChunk.content 
          };
        }
      } catch (e) {
        // Ignore context fetch errors
      }
    }
  }
  
  if (lectureContext) {
    (payload as { lectureContext?: typeof lectureContext }).lectureContext = lectureContext;
  }
  
  const response = await fetch(TUTOR_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Key': getWidgetKey()
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`Tutor request failed: ${response.status}`);
  }
  
  return await response.json();
}

function getWidgetKey(): string {
  return (window as { WIDGET_KEY?: string }).WIDGET_KEY || 
         (typeof SyncEngine !== 'undefined' ? (SyncEngine.key || '') : '');
}
