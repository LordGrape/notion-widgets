// Dragon component - Gamification/XP system
// Ported from studyengine/js/dragon.js

import { useSignal, useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { settings } from '../signals';

interface DragonStage {
  stage: number;
  rank: string;
  abbr: string;
  emoji: string;
  next: number;
}

interface DragonProps {
  sessionXP?: number;
  avgRating?: number;
}

export function Dragon({ sessionXP = 0, avgRating = 3 }: DragonProps) {
  const dragonRef = useRef<HTMLDivElement>(null);
  
  const totalXP = useSignal(0);
  
  useEffect(() => {
    // Load XP from SyncEngine
    try {
      const savedXP = SyncEngine.get('dragon', 'xp');
      totalXP.value = parseInt(String(savedXP || '0'), 10);
    } catch (e) {
      totalXP.value = 0;
    }
  }, []);
  
  const stage = useComputed(() => getDragonStage(totalXP.value));
  
  useEffect(() => {
    // Animate dragon on mount
    if (dragonRef.current && typeof gsap !== 'undefined') {
      gsap.fromTo(
        dragonRef.current,
        { scale: 0.3, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.7, delay: 0.4, ease: 'back.out(1.7)' }
      );
      
      gsap.to(dragonRef.current, {
        scaleY: 1.03,
        duration: 2.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 1.2
      });
      
      gsap.to(dragonRef.current, {
        y: -8,
        duration: 3.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 1.2
      });
    }
  }, []);
  
  // Don't render if gamification is off
  if (settings.value.gamificationMode !== 'motivated') {
    return null;
  }
  
  const s = stage.value;
  const pct = s.next === Infinity ? 100 : Math.round(((totalXP.value) / s.next) * 100);
  const flavour = getDragonFlavour(s.stage, avgRating);
  
  return (
    <div class="dragon-container" id="doneDragonWrap">
      <div ref={dragonRef} class="dragon-orb" id="doneDragonOrb">
        {s.emoji}
      </div>
      <div class="dragon-info">
        <div class="dragon-rank" id="doneDragonRank">
          {s.rank.toUpperCase()} · {totalXP.value.toLocaleString()} XP
          {s.next !== Infinity && ` · ${Math.min(pct, 99)}% to ${getDragonStage(s.next).abbr}`}
        </div>
        <div class="dragon-flavour" id="doneDragonFlavour">
          {flavour}
        </div>
      </div>
      <div class="dragon-embers" aria-hidden="true">
        <span class="dragon-ember" />
        <span class="dragon-ember" />
        <span class="dragon-ember" />
      </div>
    </div>
  );
}

export function getDragonStage(xp: number): DragonStage {
  if (xp >= 120000) return { stage: 5, rank: 'Major', abbr: 'Maj', emoji: '🐉', next: Infinity };
  if (xp >= 60000)  return { stage: 4, rank: 'Captain', abbr: 'Capt', emoji: '🐉', next: 120000 };
  if (xp >= 20000)  return { stage: 3, rank: 'Lieutenant', abbr: 'Lt', emoji: '🐉', next: 60000 };
  if (xp >= 5000)   return { stage: 2, rank: 'Second Lieutenant', abbr: '2Lt', emoji: '🐲', next: 20000 };
  if (xp >= 1000)   return { stage: 1, rank: 'Officer Cadet', abbr: 'OCdt', emoji: '🐣', next: 5000 };
  return { stage: 0, rank: 'Recruit', abbr: 'Egg', emoji: '🥚', next: 1000 };
}

export function getDragonFlavour(stage: number, avgRating: number): string {
  const lines: Record<number, { good: string; bad: string }> = {
    0: { good: 'The egg pulses warmly', bad: 'The egg rests quietly' },
    1: { good: 'Thymos chirps approvingly', bad: 'Thymos blinks at you patiently' },
    2: { good: 'Thymos flutters with excitement', bad: 'Thymos watches curiously' },
    3: { good: 'Thymos nods with respect', bad: 'Thymos stands at attention' },
    4: { good: 'Thymos roars in approval', bad: 'Thymos breathes steadily' },
    5: { good: 'Thymos glances knowingly', bad: 'Thymos meditates quietly' }
  };
  
  const s = lines[stage] || lines[0];
  return avgRating >= 2.5 ? s.good : s.bad;
}

export function addXP(amount: number): void {
  try {
    const current = parseInt(String(SyncEngine.get('dragon', 'xp') || '0'), 10);
    SyncEngine.set('dragon', 'xp', current + amount);
  } catch (e) {
    console.warn('Failed to add XP:', e);
  }
}
