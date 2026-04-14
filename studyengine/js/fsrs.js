/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function optimizeFsrsParams() {
      var TS = typeof FSRS !== 'undefined' ? FSRS : null;
      var history = (state.calibration && state.calibration.history) || [];
      if (history.length < 30 || !TS || !TS.clipParameters || !TS.checkParameters || !TS.migrateParameters) return false;
      try {
        var sum = 0, n = 0;
        history.forEach(function(h) {
          if (h && h.rating >= 1 && h.rating <= 4) { sum += h.rating; n++; }
        });
        if (n < 30) return false;
        var avg = sum / n;
        var wBase = TS.migrateParameters(w.slice());
        /* Slightly stretch intervals if ratings skew easy; compress if skew hard */
        var stretch = avg >= 3.25 ? 0.94 : avg <= 2.35 ? 1.06 : 1;
        var wNew = wBase.map(function(val, i) {
          var f = (i === 7 || i === 8 || i === 9) ? stretch : (Math.abs(stretch - 1) > 0.01 ? 1 + (stretch - 1) * 0.25 : 1);
          return val * f;
        });
        wNew = TS.clipParameters(Array.from(TS.checkParameters(wNew)), 2, true);
        w = wNew;
        if (w.length < 21) {
          while (w.length < 21) w.push(FSRS6_DEFAULT_DECAY);
        }
        if (TS.FSRS && TS.generatorParameters) {
          fsrsInstance = new TS.FSRS(TS.generatorParameters({
            w: w,
            request_retention: settings.desiredRetention || 0.9,
            enable_fuzz: true
          }));
        }
        SyncEngine.set(NS, 'optimizedWeights', w);
        return true;
      } catch (e) {
        console.warn('FSRS optimization failed:', e);
      }
      return false;
    }

    function loadOptimizedWeights() {
      var saved = SyncEngine.get(NS, 'optimizedWeights');
      var TS = typeof FSRS !== 'undefined' ? FSRS : null;
      if (!saved || !Array.isArray(saved) || saved.length < 19 || !TS || !TS.migrateParameters) return;
      if (saved.length === 19) {
        saved = saved.concat([0.0658, FSRS6_DEFAULT_DECAY]);
      }
      try {
        w = TS.migrateParameters(saved.slice());
        if (TS.FSRS && TS.generatorParameters) {
          fsrsInstance = new TS.FSRS(TS.generatorParameters({
            w: w,
            request_retention: (settings && settings.desiredRetention) || 0.9,
            enable_fuzz: true
          }));
        }
      } catch (e) {}
    }

    function getFsrsDecay() {
      return (w.length >= 21 && w[20] > 0) ? w[20] : FSRS6_DEFAULT_DECAY;
    }

    function getFsrsFactor() {
      var decay = getFsrsDecay();
      return Math.pow(0.9, 1.0 / -decay) - 1.0;
    }

    function retrievability(fsrs, nowTs) {
      if (!fsrs) return 1;
      var S = fsrs.stability || 0;
      var last = fsrs.lastReview ? new Date(fsrs.lastReview).getTime() : null;
      if (!last) return 1;
      if (!S || S <= 0) S = 0.1;
      var t = Math.max(0, daysBetween(last, nowTs));
      var decay = getFsrsDecay();
      var factor = getFsrsFactor();
      var R = Math.pow(t / S * factor + 1.0, -decay);
      return clamp(R, 0, 1);
    }

    function initialDifficulty(rating) {
      var D0 = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
      return clamp(D0, 1, 10);
    }

    function updateDifficulty(D, rating) {
      if (!D || D <= 0) D = 5;
      var Dp = D - w[6] * (rating - 3);
      return clamp(Dp, 1, 10);
    }

    function stabilityAfterSuccess(S, D, R) {
      if (!S || S <= 0) S = 1;
      if (!D || D <= 0) D = 5;
      var term = (Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1) + 1);
      var Sp = S * term;
      return clamp(Sp, 0.1, 3650);
    }

    function stabilityAfterForget(S, D, R) {
      if (!S || S < 0) S = 1;
      if (!D || D <= 0) D = 5;
      var Sp = w[11] * Math.pow(D, -w[12]) * (Math.pow((S + 1), w[13]) - 1) * Math.exp(w[14] * (1 - R));
      return clamp(Sp, 0.1, 3650);
    }

    function nextIntervalDays(S, desiredRetention) {
      var r = desiredRetention || 0.9;
      r = clamp(r, 0.80, 0.95);
      var decay = getFsrsDecay();
      var factor = getFsrsFactor();
      /* FSRS-6: t = S / factor * (R^(-1/decay) - 1) */
      return Math.max(0.1, S / factor * (Math.pow(r, -1.0 / decay) - 1.0));
    }

    function scheduleFsrs(item, rating, nowTs, allowWrite) {
      if (!item.fsrs) {
        item.fsrs = { stability: 0, difficulty: 0, due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), lastReview: null, reps: 0, lapses: 0, state: 'new' };
      }
      var f = item.fsrs;

      var first = !f.lastReview;
      var lastTs = f.lastReview ? new Date(f.lastReview).getTime() : nowTs;
      var tDays = Math.max(0, daysBetween(lastTs, nowTs));
      var S = (f.stability && f.stability > 0) ? f.stability : (first ? 1 : 0.1);
      var D = (f.difficulty && f.difficulty > 0) ? f.difficulty : (first ? initialDifficulty(rating) : 5);
      var _decay = getFsrsDecay();
      var _factor = getFsrsFactor();
      var R = clamp(Math.pow(tDays / (S || 0.1) * _factor + 1.0, -_decay), 0, 1);

      var newD = first ? initialDifficulty(rating) : updateDifficulty(D, rating);
      var newS = (rating === 1) ? stabilityAfterForget(S, newD, R) : stabilityAfterSuccess(S, newD, R);

      f.reps = (f.reps || 0) + 1;
      if (rating === 1) f.lapses = (f.lapses || 0) + 1;
      f.difficulty = newD;
      f.stability = newS;
      f.lastReview = new Date(nowTs).toISOString();

      if (rating === 1) f.state = (f.state === 'review') ? 'relearning' : 'learning';
      else f.state = 'review';

      var interval = nextIntervalDays(newS, settings.desiredRetention);
      if (first && interval < 1) {
        interval = 1;
      }
      var dueTs = nowTs + interval * 24 * 60 * 60 * 1000;
      f.due = new Date(dueTs).toISOString();

      if (allowWrite) item.fsrs = f;
      return { intervalDays: interval, retr: R };
    }

    function reweightProfile(profile, tierBuckets, targetTotal) {
      var tierOrder = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
      var counts = {};
      var remaining = targetTotal;

      /* Pass 1: cap each tier at available unique items */
      var uniqueAvailable = {};
      var seenIds = {};
      tierOrder.forEach(function(t) {
        var unique = 0;
        (tierBuckets[t] || []).forEach(function(it) {
          if (!seenIds[t + ':' + it.id]) { unique++; seenIds[t + ':' + it.id] = true; }
        });
        uniqueAvailable[t] = unique;
      });

      /* Initial ideal counts */
      tierOrder.forEach(function(t) {
        counts[t] = Math.round(profile[t] * targetTotal);
      });

      /* Cap at available */
      var excess = 0;
      var uncapped = [];
      tierOrder.forEach(function(t) {
        if (counts[t] > uniqueAvailable[t]) {
          excess += counts[t] - uniqueAvailable[t];
          counts[t] = uniqueAvailable[t];
        } else {
          uncapped.push(t);
        }
      });

      /* Redistribute excess proportionally to uncapped tiers */
      if (excess > 0 && uncapped.length > 0) {
        var uncappedTotal = 0;
        uncapped.forEach(function(t) { uncappedTotal += profile[t]; });
        if (uncappedTotal > 0) {
          uncapped.forEach(function(t) {
            var bonus = Math.round(excess * (profile[t] / uncappedTotal));
            var maxAdd = uniqueAvailable[t] - counts[t];
            counts[t] += Math.min(bonus, maxAdd);
          });
        }
      }

      /* Minimum floor: 1 item per tier if any available and target allows */
      tierOrder.forEach(function(t) {
        if (counts[t] === 0 && uniqueAvailable[t] > 0 && targetTotal > tierOrder.length) {
          counts[t] = 1;
        }
      });

      return counts;
    }
