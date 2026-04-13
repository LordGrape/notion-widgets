/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function getDragonStage(xp) {
      if (xp >= 120000) return { stage: 5, rank: 'Major', abbr: 'Maj', emoji: '🐉', next: Infinity };
      if (xp >= 60000)  return { stage: 4, rank: 'Captain', abbr: 'Capt', emoji: '🐉', next: 120000 };
      if (xp >= 20000)  return { stage: 3, rank: 'Lieutenant', abbr: 'Lt', emoji: '🐉', next: 60000 };
      if (xp >= 5000)   return { stage: 2, rank: 'Second Lieutenant', abbr: '2Lt', emoji: '🐲', next: 20000 };
      if (xp >= 1000)   return { stage: 1, rank: 'Officer Cadet', abbr: 'OCdt', emoji: '🐣', next: 5000 };
      return { stage: 0, rank: 'Recruit', abbr: 'Egg', emoji: '🥚', next: 1000 };
    }

    function getDragonImageUrl(stage) {
      return null;
    }

    function getDragonFlavour(stage, avgRating) {
      var lines = {
        0: { good: 'The egg pulses warmly', bad: 'The egg rests quietly' },
        1: { good: 'Thymos chirps approvingly', bad: 'Thymos blinks at you patiently' },
        2: { good: 'Thymos flutters with excitement', bad: 'Thymos watches curiously' },
        3: { good: 'Thymos nods with respect', bad: 'Thymos stands at attention' },
        4: { good: 'Thymos roars in approval', bad: 'Thymos breathes steadily' },
        5: { good: 'Thymos glances knowingly', bad: 'Thymos meditates quietly' }
      };
      var s = lines[stage] || lines[0];
      return (avgRating >= 2.5) ? s.good : s.bad;
    }

    function animateDoneDragon(sessionXP, avgRating) {
      var totalXP = 0;
      try { totalXP = parseInt(SyncEngine.get('dragon', 'xp') || '0', 10); } catch(e) {}
      var info = getDragonStage(totalXP);
      var imgUrl = getDragonImageUrl(info.stage);
      var orbEl = document.getElementById('doneDragonOrb');
      var wrapEl = document.getElementById('doneDragonWrap');
      if (window.gsap && wrapEl) {
        gsap.killTweensOf(wrapEl.querySelectorAll('.dragon-ember, .done-dragon-orb, .done-dragon-img, #doneDragonRank, #doneDragonFlavour'));
      }
      if (orbEl && wrapEl) {
        var staleImg = wrapEl.querySelector('.done-dragon-img');
        if (staleImg) staleImg.remove();
        if (imgUrl) {
          var img = document.createElement('img');
          img.className = 'done-dragon-img';
          img.src = imgUrl;
          img.alt = 'Thymos - ' + info.rank;
          orbEl.style.display = 'none';
          wrapEl.insertBefore(img, wrapEl.firstChild);
        } else {
          orbEl.textContent = info.emoji;
          orbEl.style.display = '';
        }
      }
      var rankEl = document.getElementById('doneDragonRank');
      var flavEl = document.getElementById('doneDragonFlavour');
      if (rankEl) {
        var pct = info.next === Infinity ? 100 : Math.round(((totalXP) / info.next) * 100);
        rankEl.textContent = info.rank.toUpperCase() + ' · ' + totalXP.toLocaleString() + ' XP' +
          (info.next !== Infinity ? ' · ' + Math.min(pct, 99) + '% to ' + getDragonStage(info.next).abbr : '');
      }
      if (flavEl) flavEl.textContent = getDragonFlavour(info.stage, avgRating);
      if (!window.gsap) return;
      var target = imgUrl ? wrapEl.querySelector('.done-dragon-img') : orbEl;
      if (!target) return;
      gsap.fromTo(target,
        { scale: 0.3, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.7, delay: 0.4, ease: 'back.out(1.7)' }
      );
      gsap.to(target, {
        scaleY: 1.03, duration: 2.5, ease: 'sine.inOut',
        yoyo: true, repeat: -1, delay: 1.2
      });
      gsap.to(target, {
        y: -8, duration: 3.5, ease: 'sine.inOut',
        yoyo: true, repeat: -1, delay: 1.2
      });
      gsap.to(target, {
        filter: 'drop-shadow(0 0 24px rgba(var(--accent-rgb), 0.7))',
        duration: 2, ease: 'sine.inOut',
        yoyo: true, repeat: -1, delay: 1.2
      });
      var embers = wrapEl.querySelectorAll('.dragon-ember');
      embers.forEach(function(ember, i) {
        var startX = (Math.random() - 0.5) * 80;
        var startY = 20 + Math.random() * 30;
        gsap.set(ember, { x: startX, y: startY, opacity: 0 });
        gsap.to(ember, {
          y: startY - 50 - Math.random() * 40,
          x: startX + (Math.random() - 0.5) * 30,
          opacity: 0.7,
          duration: 1.5 + Math.random() * 1.5,
          delay: 0.8 + i * 0.18,
          ease: 'power1.out',
          repeat: -1,
          repeatDelay: Math.random() * 0.5,
          yoyo: false,
          onRepeat: function() {
            gsap.set(ember, {
              x: (Math.random() - 0.5) * 80,
              y: 20 + Math.random() * 30,
              opacity: 0
            });
          }
        });
      });
      if (rankEl) gsap.fromTo(rankEl, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4, delay: 0.9, ease: 'power2.out' });
      if (flavEl) gsap.fromTo(flavEl, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 1.2, ease: 'power2.out' });
    }

    function checkDragonEvolution(xpBefore, xpAfter) {
      var stageBefore = getDragonStage(xpBefore).stage;
      var stageAfter = getDragonStage(xpAfter).stage;
      if (stageAfter > stageBefore) {
        var info = getDragonStage(xpAfter);
        var ov = document.getElementById('milestoneOv');
        var emojiEl = document.getElementById('msEmoji');
        var rankEl = document.getElementById('msRank');
        var dismissBtn = document.getElementById('msDismiss');
        if (ov && emojiEl && rankEl) {
          emojiEl.textContent = info.emoji;
          rankEl.textContent = info.rank;
          ov.classList.add('show');
          try { playChime(); } catch(e) {}
          try { launchConfetti(); } catch(e) {}
          if (window.gsap) {
            gsap.fromTo(ov.querySelector('.milestone-card'),
              { scale: 0.7, opacity: 0 },
              { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.8)' }
            );
          }
          if (dismissBtn) {
            dismissBtn.onclick = function() { ov.classList.remove('show'); };
          }
        }
      }
    }

    function updateSessionXPBar() {
      if (!session) return;
      var fill = document.getElementById('sessionXPFill');
      var valueEl = document.getElementById('sessionXPValue');
      var target = Math.max(1, parseInt(settings.sessionLimit || 12, 10)) * 15;
      var pct = Math.min(100, Math.round((session.xp / target) * 100));
      if (fill) {
        if (window.gsap) gsap.to(fill, { width: pct + '%', duration: 0.5, ease: 'back.out(1.4)' });
        else fill.style.width = pct + '%';
      }
      if (valueEl) {
        var prev = parseInt(valueEl.textContent, 10) || 0;
        if (window.gsap && prev !== session.xp) {
          var obj = { val: prev };
          gsap.to(obj, { val: session.xp, duration: 0.4, ease: 'power2.out', onUpdate: function() { valueEl.textContent = Math.round(obj.val) + ' XP'; } });
        } else {
          valueEl.textContent = session.xp + ' XP';
        }
      }
    }
