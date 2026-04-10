/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function buildCourseTree() {
      var tree = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        var course = it.course || 'Uncategorized';
        var topic = it.topic || 'General';
        if (!tree[course]) tree[course] = { topics: {}, totalCards: 0, dueCards: 0 };
        if (!tree[course].topics[topic]) tree[course].topics[topic] = { cards: [], dueCards: 0 };
        tree[course].topics[topic].cards.push(id);
        tree[course].totalCards++;
        var f = it.fsrs && it.fsrs.due ? it.fsrs : null;
        if (!f || !f.lastReview) {
          tree[course].dueCards++;
          tree[course].topics[topic].dueCards++;
        } else {
          var dueDate = new Date(f.due);
          if (dueDate <= new Date()) {
            tree[course].dueCards++;
            tree[course].topics[topic].dueCards++;
          }
        }
      }
      return tree;
    }

    function renderSidebar() {
      if (isEmbedded) return;
      var container = document.getElementById('sidebarTree');
      if (!container) return;
      var archivedCourses = listCourses(true).filter(function(c) { return c && c.archived; });
      var archivedBtn = document.getElementById('sbArchivedBtn');
      var archivedCount = document.getElementById('sbArchivedCount');
      if (archivedBtn) archivedBtn.style.display = archivedCourses.length > 0 ? 'flex' : 'none';
      if (archivedCount) archivedCount.textContent = String(archivedCourses.length);

      var tree = buildCourseTree();
      var html = '';

      // Total counts
      var totalCards = 0, totalDue = 0;
      for (var c in tree) { totalCards += tree[c].totalCards; totalDue += tree[c].dueCards; }

      // "All Courses" row
      var allActive = sidebarSelection.level === 'all' ? ' active' : '';
      html += '<div class="tree-node depth-0 tree-node-hoverable tree-node-root-actions' + allActive + '" data-level="all">';
      html += '<span class="tree-icon">📚</span>';
      html += '<span class="tree-label">All Courses</span>';
      if (totalDue > 0) html += '<span class="tree-badge">' + totalDue + '</span>';
      html += '<span class="tree-hover-actions">';
      html += '<button class="tree-action-btn" data-action="create-course" title="Add deck" aria-label="Add deck">＋</button>';
      html += '</span>';
      html += '</div>';
      html += '<div class="tree-section-divider"></div>';

      // Courses — collapsed by default
      var courseNames = Object.keys(tree).sort();

      courseNames.forEach(function(courseName) {
        var courseData = state.courses[courseName] || {};
        ensureCourseModules(courseName);
        var ct = tree[courseName];
        var color = courseData.color || '#8b5cf6';
        var isExpanded = sidebarExpanded[courseName] === true; // default collapsed
        var courseActive = (sidebarSelection.course === courseName) ? ' active' : '';
        var cram = getCramState(courseName);
        var modules = (courseData.modules || []);

        // Course row with hover actions
        html += '<div class="tree-node depth-0 tree-node-hoverable' + courseActive + '" data-level="course" data-course="' + esc(courseName) + '">';
        html += '<span class="tree-chevron' + (isExpanded ? ' expanded' : '') + '" data-toggle="' + esc(courseName) + '"></span>';
        html += '<span class="tree-icon" style="color:' + color + ';">●</span>';
        html += '<span class="tree-label">' + esc(courseName) + '</span>';
        if (ct.dueCards > 0) html += '<span class="tree-badge">' + ct.dueCards + '</span>';
        // Hover actions
        html += '<span class="tree-hover-actions">';
        html += '<button class="tree-action-btn" data-action="add-module" data-course="' + esc(courseName) + '" title="Add subdeck">＋</button>';
        html += '<button class="tree-action-btn" data-action="course-menu" data-course="' + esc(courseName) + '" title="More options">⋯</button>';
        html += '</span>';
        html += '</div>';

        // Cram badge (inline)
        if (cram.active) {
          html += '<div class="tree-inline-badge" style="padding-left:42px;' + (isExpanded ? '' : 'display:none;') + '" data-parent="' + esc(courseName) + '">';
          html += '<span class="tree-cram-badge">🔥 ' + (cram.daysUntil != null ? cram.daysUntil + 'd to exam' : 'Cram') + '</span>';
          html += '</div>';
        }

        // Expanded content: modules then ungrouped topics
        if (isExpanded) {
          var assignedTopics = {};

          // Modules
          modules.forEach(function(mod) {
            if (!mod || !mod.id) return;
            var modExpanded = sidebarExpanded[mod.id] === true;
            var modActive = (sidebarSelection.module === mod.id) ? ' active' : '';
            var modCards = 0, modDue = 0;
            (mod.topics || []).forEach(function(t) {
              if (ct.topics[t]) { modCards += ct.topics[t].cards.length; modDue += ct.topics[t].dueCards; }
              assignedTopics[t] = true;
            });

            html += '<div class="tree-node depth-1 tree-node-hoverable' + modActive + '" data-level="module" data-course="' + esc(courseName) + '" data-module="' + esc(mod.id) + '">';
            if (mod.topics && mod.topics.length > 0) {
              html += '<span class="tree-chevron' + (modExpanded ? ' expanded' : '') + '" data-toggle="' + esc(mod.id) + '"></span>';
            } else {
              html += '<span class="tree-chevron" style="visibility:hidden;"></span>';
            }
            html += '<span class="tree-icon">' + (mod.lectureImported ? '📖' : '📁') + '</span>';
            html += '<span class="tree-label">' + esc(mod.name || 'Subdeck') + '</span>';
            if (modCards > 0) html += '<span class="tree-count">' + modCards + '</span>';
            if (modDue > 0) html += '<span class="tree-badge">' + modDue + '</span>';
            html += '<span class="tree-hover-actions">';
            html += '<button class="tree-action-btn" data-action="module-menu" data-course="' + esc(courseName) + '" data-module="' + esc(mod.id) + '" title="Options">⋯</button>';
            html += '</span>';
            html += '</div>';

            // Topics under module (expanded)
            if (modExpanded && mod.topics) {
              mod.topics.forEach(function(t) {
                if (!ct.topics[t]) return;
                var topicActive = (sidebarSelection.topic === t && sidebarSelection.course === courseName) ? ' active' : '';
                html += '<div class="tree-node depth-2' + topicActive + '" data-level="topic" data-course="' + esc(courseName) + '" data-topic="' + esc(t) + '">';
                html += '<span class="tree-label">' + esc(t) + '</span>';
                html += '<span class="tree-count">' + ct.topics[t].cards.length + '</span>';
                if (ct.topics[t].dueCards > 0) html += '<span class="tree-badge">' + ct.topics[t].dueCards + '</span>';
                html += '</div>';
              });
            }
          });

          // Ungrouped topics
          var ungrouped = Object.keys(ct.topics).filter(function(t) { return !assignedTopics[t]; }).sort();
          if (ungrouped.length > 0) {
            if (modules.length > 0) {
              var ugKey = '_ungrouped_' + courseName;
              var ugExpanded = sidebarExpanded[ugKey] === true;
              html += '<div class="tree-node depth-1" data-level="ungrouped" data-course="' + esc(courseName) + '" style="opacity:0.65;">';
              html += '<span class="tree-chevron' + (ugExpanded ? ' expanded' : '') + '" data-toggle="' + esc(ugKey) + '"></span>';
              html += '<span class="tree-icon">📦</span>';
              html += '<span class="tree-label">Ungrouped</span>';
              html += '<span class="tree-count">' + ungrouped.reduce(function(s, t) { return s + ct.topics[t].cards.length; }, 0) + '</span>';
              html += '</div>';
              if (ugExpanded) {
                ungrouped.forEach(function(t) {
                  var topicActive = (sidebarSelection.topic === t && sidebarSelection.course === courseName) ? ' active' : '';
                  html += '<div class="tree-node depth-2' + topicActive + '" data-level="topic" data-course="' + esc(courseName) + '" data-topic="' + esc(t) + '">';
                  html += '<span class="tree-label">' + esc(t) + '</span>';
                  html += '<span class="tree-count">' + ct.topics[t].cards.length + '</span>';
                  if (ct.topics[t].dueCards > 0) html += '<span class="tree-badge">' + ct.topics[t].dueCards + '</span>';
                  html += '</div>';
                });
              }
            } else {
              var tKey = '_topics_' + courseName;
              var topicsExpanded = sidebarExpanded[tKey] === true;
              html += '<div class="tree-node depth-1" data-level="topics-toggle" data-course="' + esc(courseName) + '" style="opacity:0.7;">';
              html += '<span class="tree-chevron' + (topicsExpanded ? ' expanded' : '') + '" data-toggle="' + esc(tKey) + '"></span>';
              html += '<span class="tree-icon">🏷</span>';
              html += '<span class="tree-label">Topics (' + ungrouped.length + ')</span>';
              html += '</div>';
              if (topicsExpanded) {
                ungrouped.forEach(function(t) {
                  var topicActive = (sidebarSelection.topic === t && sidebarSelection.course === courseName) ? ' active' : '';
                  html += '<div class="tree-node depth-2' + topicActive + '" data-level="topic" data-course="' + esc(courseName) + '" data-topic="' + esc(t) + '">';
                  html += '<span class="tree-label">' + esc(t) + '</span>';
                  html += '<span class="tree-count">' + ct.topics[t].cards.length + '</span>';
                  if (ct.topics[t].dueCards > 0) html += '<span class="tree-badge">' + ct.topics[t].dueCards + '</span>';
                  html += '</div>';
                });
              }
            }
          }
        }
      });

      container.innerHTML = html;

      // Event delegation
      container.onclick = function(e) {
        // Chevron toggles
        var chevron = e.target.closest && e.target.closest('.tree-chevron[data-toggle]');
        if (chevron) {
          var key = chevron.dataset.toggle;
          sidebarExpanded[key] = !sidebarExpanded[key];
          renderSidebar();
          try { playClick(); } catch (ex) {}
          return;
        }

        // Hover action buttons
        var actionBtn = e.target.closest && e.target.closest('.tree-action-btn');
        if (actionBtn) {
          e.stopPropagation();
          var action = actionBtn.dataset.action;
          var actionCourse = actionBtn.dataset.course;
          var actionModule = actionBtn.dataset.module;

          if (action === 'add-module') {
            sidebarExpanded[actionCourse] = true;
            renderSidebar();
            var freshNode = document.getElementById('sidebarTree')
              ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="course"][data-course="' + esc(actionCourse) + '"]')
              : null;
            showInlineSidebarInput(freshNode, 'Subdeck name...', function(name) {
              addModuleToCourse(actionCourse, { name: name, topics: [], lectureImported: false });
              renderSidebar();
              toast('Created subdeck: ' + name);
            });
            return;
          }

          if (action === 'create-course') {
            openCreateCourseFlow();
            return;
          }

          if (action === 'course-menu') {
            showCourseContextMenu(actionCourse, actionBtn);
            return;
          }

          if (action === 'module-menu') {
            showModuleContextMenu(actionCourse, actionModule, actionBtn);
            return;
          }
          return;
        }

        // Node clicks
        var node = e.target.closest && e.target.closest('.tree-node');
        if (!node) return;
        var level = node.dataset.level;
        var courseName = node.dataset.course || null;
        var moduleId = node.dataset.module || null;
        var topic = node.dataset.topic || null;

        if (level === 'ungrouped' || level === 'topics-toggle') return;

        sidebarSelection = { level: level, course: courseName, module: moduleId, topic: topic };

        if (level === 'course' && courseName && !sidebarExpanded[courseName]) {
          sidebarExpanded[courseName] = true;
        }

        renderSidebar();
        updateBreadcrumb();
        applySidebarFilter();
        try { playClick(); } catch (ex2) {}
      };
    }

    function updateBreadcrumb() {
      if (isEmbedded) return;
      var bc = document.getElementById('mainBreadcrumb');
      if (!bc) return;
      var html = '<span class="bc-segment bc-root" data-level="all">All Courses</span>';
      if (sidebarSelection.course) {
        html += '<span class="bc-separator">›</span>';
        html += '<span class="bc-segment" data-level="course" data-course="' + esc(sidebarSelection.course) + '">' + esc(sidebarSelection.course) + '</span>';
      }
      if (sidebarSelection.module && sidebarSelection.course) {
        var mod = getModuleById(sidebarSelection.course, sidebarSelection.module);
        if (mod) {
          html += '<span class="bc-separator">›</span>';
          html += '<span class="bc-segment" data-level="module" data-course="' + esc(sidebarSelection.course) + '" data-module="' + esc(mod.id) + '">' + esc(mod.name || 'Subdeck') + '</span>';
        }
      }
      if (sidebarSelection.topic) {
        html += '<span class="bc-separator">›</span>';
        html += '<span class="bc-segment" data-level="topic" data-course="' + esc(sidebarSelection.course || '') + '" data-module="' + esc(sidebarSelection.module || '') + '" data-topic="' + esc(sidebarSelection.topic) + '">' + esc(sidebarSelection.topic) + '</span>';
      }
      bc.innerHTML = html;

      bc.onclick = function(e) {
        var seg = e.target && e.target.closest ? e.target.closest('.bc-segment') : null;
        if (!seg) return;
        var level = seg.dataset.level;
        if (level === 'all') sidebarSelection = { level: 'all', course: null, module: null, topic: null };
        else if (level === 'course') sidebarSelection = { level: 'course', course: seg.dataset.course, module: null, topic: null };
        else if (level === 'module') sidebarSelection = { level: 'module', course: seg.dataset.course || sidebarSelection.course, module: seg.dataset.module, topic: null };
        else if (level === 'topic') sidebarSelection = { level: 'topic', course: seg.dataset.course || sidebarSelection.course, module: seg.dataset.module || null, topic: seg.dataset.topic || sidebarSelection.topic };
        renderSidebar();
        updateBreadcrumb();
        applySidebarFilter();
      };
    }

    function applySidebarFilter() {
      // 1) Bridge to existing course filter
      applySidebarFilterChipsOnly();

      // Ensure we're on the dashboard view in standalone so context views can render
      if (!isEmbedded) {
        try { showView('viewDash'); } catch (e0) {}
        try { switchNav('home'); } catch (e1) {}
      }

      // 2) Context views
      if (!isEmbedded) {
        if (sidebarSelection.level === 'course' && sidebarSelection.course) {
          showCourseDashboard(sidebarSelection.course);
          return;
        } else if (sidebarSelection.level === 'module' && sidebarSelection.course && sidebarSelection.module) {
          showModuleView(sidebarSelection.course, sidebarSelection.module);
          return;
        } else if (sidebarSelection.level === 'topic' && sidebarSelection.course && sidebarSelection.topic) {
          showTopicView(sidebarSelection.course, sidebarSelection.topic);
          return;
        } else {
          hideContextViews();
        }
      }

      try { renderDashboard(); } catch (e2) {}
    }

    function showCourseDashboard(courseName) {
      hideContextViews();
      var view = document.getElementById('courseDashView');
      var content = document.getElementById('courseDashContent');
      if (!view || !content) return;

      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = 'none';
      view.style.display = 'block';

      var courseData = state.courses && state.courses[courseName] ? state.courses[courseName] : {};
      ensureCourseModules(courseName);
      var stats = getCourseStats(courseName);
      var color = courseData.color || '#8b5cf6';
      var cram = (typeof getCramState === 'function') ? getCramState(courseName) : { active: false };
      var modules = courseData.modules || [];

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + esc(courseName) + '</div>';
      var subtitleParts = [];
      subtitleParts.push(stats.total + ' cards');
      if (stats.due > 0) subtitleParts.push(stats.due + ' due');
      if (courseData.examDate) {
        var daysLeft = (typeof getCramState === 'function') ? getCramState(courseName).daysUntil : null;
        subtitleParts.push('Exam: ' + courseData.examDate + (daysLeft != null ? ' (' + daysLeft + 'd)' : ''));
      }
      h += '<div class="ctx-subtitle">' + esc(subtitleParts.join(' · ')) + '</div>';
      h += '</div>';
      if (cram && cram.active) h += '<span class="tree-cram-badge">🔥 CRAM</span>';
      h += '</div>';

      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyCourse">▶ Study This Course' + (stats.due > 0 ? ' (' + stats.due + ' due)' : '') + '</button>';
      h += '<button class="ghost-btn" id="ctxManageCourse">⚙ Manage</button>';
      h += '<button class="ghost-btn" id="ctxImportLecture">📖 Import Lecture</button>';
      h += '</div>';

      h += '<div class="stats-row">';
      h += '<div class="stat"><div class="k">TOTAL</div><div class="v">' + stats.total + '</div></div>';
      h += '<div class="stat"><div class="k">DUE</div><div class="v">' + stats.due + '</div></div>';
      h += '<div class="stat"><div class="k">AVG STABILITY</div><div class="v">' + stats.avgStability + 'd</div></div>';
      h += '</div>';

      if (stats.total > 0) {
        h += '<div class="ctx-section-title">Tier Distribution</div>';
        h += '<div class="breakdown">';
        var tiers = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
        tiers.forEach(function(t) {
          var count = stats.tierDist[t] || 0;
          if (count > 0) {
            h += '<div class="tier-pill"><span class="tier-dot" style="background:' + tierColour(t) + ';"></span>' + esc(tierLabel(t)) + ' ' + count + '</div>';
          }
        });
        h += '</div>';
      }

      if (modules.length > 0) {
        h += '<div class="ctx-section-title">Modules</div>';
        h += '<div class="ctx-modules-grid">';
        modules.forEach(function(mod) {
          if (!mod || !mod.id) return;
          var ms = getModuleStats(courseName, mod.id);
          var pct = ms.total > 0 ? Math.round((ms.reviewed / ms.total) * 100) : 0;
          h += '<div class="ctx-module-card" data-module="' + esc(mod.id) + '">';
          h += '<div class="mc-name">' + (mod.lectureImported ? '📖 ' : '📁 ') + esc(mod.name || 'Module') + '</div>';
          h += '<div class="mc-stats"><span>' + ms.total + ' cards</span>';
          if (ms.due > 0) h += '<span style="color:var(--accent);">' + ms.due + ' due</span>';
          h += '<span>' + pct + '% reviewed</span></div>';
          h += '<div class="mc-progress"><div class="mc-progress-fill" style="width:' + pct + '%;"></div></div>';
          h += '</div>';
        });
        h += '</div>';
      }

      h += '<div class="ctx-section-title">Lecture Materials</div>';
      var importedCount = modules.filter(function(m) { return m && m.lectureImported; }).length;
      if (importedCount > 0) {
        h += '<div class="ctx-lecture-badge">📚 ' + importedCount + ' lecture' + (importedCount !== 1 ? 's' : '') + ' imported · Context active for AI grading</div>';
      } else {
        h += '<div style="font-size:11px;color:var(--text-tertiary);margin:4px 0;">No lectures imported yet. Import lectures to improve AI grading accuracy.</div>';
      }

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyCourse');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'course', course: courseName, module: null, topic: null };
        applySidebarFilterChipsOnly();
        startSession();
      });

      var manageBtn = document.getElementById('ctxManageCourse');
      if (manageBtn) manageBtn.addEventListener('click', function() {
        openCourseModal();
        try { window.openEditCourse && window.openEditCourse(courseName); } catch(e) {}
      });

      var importBtn = document.getElementById('ctxImportLecture');
      if (importBtn) importBtn.addEventListener('click', function() {
        openCourseModal();
        try { window.openEditCourse && window.openEditCourse(courseName); } catch(e) {}
      });

      content.querySelectorAll('.ctx-module-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var modId = this.dataset.module;
          sidebarSelection = { level: 'module', course: courseName, module: modId, topic: null };
          renderSidebar();
          updateBreadcrumb();
          showModuleView(courseName, modId);
          try { playClick(); } catch(e) {}
        });
      });

      animateProgressRings(content);
      if (window.gsap) {
        gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
        gsap.fromTo(content.querySelectorAll('.ctx-stats-grid .stat'),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out' }
        );
      }
    }

    function showCourseDashboard(courseName) {
      hideContextViews();
      var view = document.getElementById('courseDashView');
      var content = document.getElementById('courseDashContent');
      if (!view || !content) return;

      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = 'none';
      view.style.display = 'block';

      var courseData = state.courses && state.courses[courseName] ? state.courses[courseName] : {};
      ensureCourseModules(courseName);
      var stats = getCourseStats(courseName);
      var color = courseData.color || '#8b5cf6';
      var cram = (typeof getCramState === 'function') ? getCramState(courseName) : { active: false };
      var modules = courseData.modules || [];
      var daysLeft = (typeof getCramState === 'function') ? getCramState(courseName).daysUntil : null;
      var examLine = courseData.examDate
        ? ((daysLeft != null ? daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' until exam' : 'Exam scheduled') + ' · ' + courseData.examDate)
        : 'No exam date set · Long-term retention mode';

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + esc(courseName) + '</div>';
      h += '<div class="ctx-subtitle">' + esc(stats.total + ' cards' + (stats.due > 0 ? ' · ' + stats.due + ' due' : '') + (courseData.examDate ? ' · Exam: ' + courseData.examDate : '')) + '</div>';
      h += '</div>';
      if (cram && cram.active) h += '<span class="tree-cram-badge">🔥 CRAM</span>';
      h += '<div class="ctx-header-actions"><button class="icon-btn ctx-kebab" id="ctxCourseActions" type="button" title="Course actions" aria-label="Course actions">⋮</button></div>';
      h += '</div>';

      h += '<div class="ctx-hero">';
      h += '<div class="ctx-hero-due">' + stats.due + '</div>';
      h += '<div class="ctx-hero-label">Cards due</div>';
      h += '<div class="ctx-hero-exam">' + esc(examLine) + '</div>';
      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyCourse" style="width:100%;max-width:480px;">▶ Study This Course' + (stats.due > 0 ? ' (' + stats.due + ' due)' : '') + '</button>';
      h += '</div>';
      h += '</div>';

      var duePct = stats.total > 0 ? Math.round((stats.due / stats.total) * 100) : 0;
      var retentionPct = stats.avgRetention == null ? 0 : clamp(stats.avgRetention, 0, 100);
      var stabilityMeta = getStabilityMeta(stats.avgStability || 0);
      h += '<div class="ctx-stats-grid">';
      h += '<div class="stat"><div class="k">TOTAL</div><div class="v">' + stats.total + '</div><div class="s">' + (stats.reviewed || 0) + ' reviewed</div></div>';
      h += '<div class="stat"><div class="k">DUE</div><div class="v">' + stats.due + '</div><div class="stat-bar"><div class="stat-bar-fill" style="width:' + duePct + '%;background:' + getDueBarColor(duePct) + '"></div></div><div class="s">of ' + stats.total + ' total</div></div>';
      h += '<div class="stat"><div class="k">AVG STABILITY</div><div class="v stability-badge" style="color:' + stabilityMeta.color + ';">' + stats.avgStability + 'd</div><div class="s">' + stabilityMeta.label + '</div></div>';
      h += '<div class="stat stat-ring"><div class="k">AVG RETENTION</div><div class="stat-ring-wrap">' + svgRing(retentionPct, 58, 6, getRetentionRingColor(retentionPct)) + '<div class="stat-ring-value">' + (stats.avgRetention == null ? '—' : (retentionPct + '%')) + '</div></div><div class="s">FSRS retrievability</div></div>';
      h += '</div>';

      h += '<details class="dash-details" open>';
      h += '<summary class="dash-details-toggle"><span class="se-icon">📊</span> Tier Breakdown &amp; Materials <span class="dash-details-arrow">▸</span></summary>';
      h += '<div class="dash-details-body ctx-detail-stack">';
      if (modules.length > 0) {
        h += '<div><div class="ctx-section-title">Subdecks</div>';
        h += '<div class="ctx-modules-grid">';
        modules.forEach(function(mod) {
          if (!mod || !mod.id) return;
          var ms = getModuleStats(courseName, mod.id);
          var pct = ms.total > 0 ? Math.round((ms.reviewed / ms.total) * 100) : 0;
          h += '<div class="ctx-module-card" data-module="' + esc(mod.id) + '">';
          h += '<div class="mc-name">' + (mod.lectureImported ? '📖 ' : '📁 ') + esc(mod.name || 'Subdeck') + '</div>';
          h += '<div class="mc-stats"><span>' + ms.total + ' cards</span>';
          if (ms.due > 0) h += '<span style="color:var(--accent);">' + ms.due + ' due</span>';
          h += '<span>' + pct + '% reviewed</span></div>';
          h += '<div class="mc-progress"><div class="mc-progress-fill" style="width:' + pct + '%;"></div></div>';
          h += '</div>';
        });
        h += '</div></div>';
      }
      if (stats.total > 0) {
        h += '<div><div class="ctx-section-title">Tier Distribution</div>';
        h += '<div class="breakdown">';
        ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'].forEach(function(t) {
          var count = stats.tierDist[t] || 0;
          if (count > 0) h += '<div class="tier-pill"><span class="tier-dot" style="background:' + tierColour(t) + ';"></span>' + esc(tierLabel(t)) + ' ' + count + '</div>';
        });
        h += '</div></div>';
      }
      h += '<div><div class="ctx-section-title">Lecture Materials</div>';
      var importedCount = modules.filter(function(m) { return m && m.lectureImported; }).length;
      if (importedCount > 0) h += '<div class="ctx-lecture-badge">📚 ' + importedCount + ' lecture' + (importedCount !== 1 ? 's' : '') + ' imported · Context active for AI grading</div>';
      else h += '<div style="font-size:11px;color:var(--text-tertiary);margin:4px 0;">No lectures imported yet. Import lectures to improve AI grading accuracy.</div>';
      h += '</div>';
      h += '</div></details>';

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyCourse');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'course', course: courseName, module: null, topic: null };
        applySidebarFilterChipsOnly();
        startSession();
      });

      var actionsBtn = document.getElementById('ctxCourseActions');
      if (actionsBtn) actionsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showCourseContextMenu(courseName, actionsBtn);
      });

      content.querySelectorAll('.ctx-module-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var modId = this.dataset.module;
          sidebarSelection = { level: 'module', course: courseName, module: modId, topic: null };
          renderSidebar();
          updateBreadcrumb();
          showModuleView(courseName, modId);
          try { playClick(); } catch (e) {}
        });
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }

    function showModuleView(courseName, moduleId) {
      hideContextViews();
      var view = document.getElementById('moduleDetailView');
      var content = document.getElementById('moduleDetailContent');
      if (!view || !content) return;

      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = 'none';
      view.style.display = 'block';

      var mod = getModuleById(courseName, moduleId);
      if (!mod) { content.innerHTML = '<div class="ctx-empty">Subdeck not found.</div>'; return; }

      var cards = getCardsForModule(courseName, moduleId);
      var due = cards.filter(isDueNow);
      var courseData = state.courses && state.courses[courseName] ? state.courses[courseName] : {};
      var color = courseData.color || '#8b5cf6';

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + (mod.lectureImported ? '📖 ' : '📁 ') + esc(mod.name || 'Subdeck') + '</div>';
      h += '<div class="ctx-subtitle">' + cards.length + ' cards · ' + due.length + ' due · ' + ((mod.topics || []).length) + ' topics</div>';
      h += '</div>';
      if (mod.lectureImported) h += '<span class="ctx-lecture-badge">📖 Lecture context active</span>';
      h += '</div>';

      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyModule">▶ Study This Subdeck' + (due.length > 0 ? ' (' + due.length + ' due)' : '') + '</button>';
      h += '<button class="ghost-btn" id="ctxRenameModule">✏ Rename</button>';
      h += '</div>';

      if (mod.topics && mod.topics.length > 0) {
        h += '<div class="ctx-section-title">Topics</div>';
        h += '<div class="breakdown">';
        mod.topics.forEach(function(t) {
          var topicCards = getCardsForTopic(courseName, t);
          var topicDue = topicCards.filter(isDueNow).length;
          h += '<div class="tier-pill" style="cursor:pointer;" data-nav-topic="' + esc(t) + '">';
          h += esc(t) + ' <span style="opacity:0.6;">' + topicCards.length + '</span>';
          if (topicDue > 0) h += ' <span style="color:var(--accent);">' + topicDue + '</span>';
          h += '</div>';
        });
        h += '</div>';
      }

      h += '<div class="ctx-section-title">Cards (' + cards.length + ')</div>';
      if (cards.length === 0) h += '<div class="ctx-empty">No cards in this subdeck yet.</div>';
      else h += renderCardList(cards);

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyModule');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'module', course: courseName, module: moduleId, topic: null };
        applySidebarFilterChipsOnly();
        startSession();
      });

      var renameBtn = document.getElementById('ctxRenameModule');
      if (renameBtn) renameBtn.addEventListener('click', function() {
        var modNode = document.getElementById('sidebarTree')
          ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="module"][data-module="' + esc(moduleId) + '"]')
          : null;
        showInlineSidebarInput(modNode, mod.name || 'Subdeck name...', function(newName) {
          renameModule(courseName, moduleId, newName);
          renderSidebar();
          showModuleView(courseName, moduleId);
        });
      });

      content.querySelectorAll('[data-nav-topic]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          var t = this.dataset.navTopic;
          sidebarSelection = { level: 'topic', course: courseName, module: moduleId, topic: t };
          renderSidebar();
          updateBreadcrumb();
          showTopicView(courseName, t);
          try { playClick(); } catch(e) {}
        });
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }

    function showTopicView(courseName, topic) {
      hideContextViews();
      var view = document.getElementById('topicDetailView');
      var content = document.getElementById('topicDetailContent');
      if (!view || !content) return;

      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = 'none';
      view.style.display = 'block';

      var cards = getCardsForTopic(courseName, topic);
      var due = cards.filter(isDueNow);
      var courseData = state.courses && state.courses[courseName] ? state.courses[courseName] : {};
      var color = courseData.color || '#8b5cf6';
      var mod = getModuleForTopic(courseName, topic);

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + esc(topic) + '</div>';
      h += '<div class="ctx-subtitle">' + cards.length + ' cards · ' + due.length + ' due' + (mod ? (' · in ' + esc(mod.name || 'Subdeck')) : '') + '</div>';
      h += '</div>';
      h += '</div>';

      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyTopic">▶ Study This Topic' + (due.length > 0 ? ' (' + due.length + ' due)' : '') + '</button>';
      h += '</div>';

      h += '<div class="ctx-section-title">Cards (' + cards.length + ')</div>';
      if (cards.length === 0) h += '<div class="ctx-empty">No cards with this topic.</div>';
      else h += renderCardList(cards);

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyTopic');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'topic', course: courseName, module: null, topic: topic };
        applySidebarFilterChipsOnly();
        startSession();
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }

    function showCourseContextMenu(courseName, anchor) {
      showCtxMenuAt(anchor, [
        {
          icon: '📖',
          label: 'Import Lecture',
          action: function() {
            try { openCourseModal && openCourseModal(); } catch (e1) {}
            setTimeout(function() {
              try { window.openEditCourse && window.openEditCourse(courseName); } catch (e2) {}
            }, 120);
          }
        },
        {
          icon: '📁',
          label: 'Add Subdeck',
          action: function() {
            sidebarExpanded[courseName] = true;
            renderSidebar();
            var freshNode = document.getElementById('sidebarTree')
              ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="course"][data-course="' + esc(courseName) + '"]')
              : null;
            showInlineSidebarInput(freshNode, 'Subdeck name...', function(name) {
              addModuleToCourse(courseName, { name: name, topics: [], lectureImported: false });
              renderSidebar();
              toast('Created subdeck: ' + name);
            });
          }
        },
        {
          icon: '⚙',
          label: 'Manage Course',
          action: function() {
            try { openEditCourse && openEditCourse(courseName); } catch (e) {}
          }
        },
        { divider: true },
        {
          icon: '📥',
          label: 'Archive Course',
          danger: false,
          action: function() {
            showCtxMenuAt(anchor, [
              {
                icon: '⚠',
                label: 'Confirm: Archive all cards in ' + courseName + '?',
                danger: true,
                action: function() {
                  var count = 0;
                  for (var id in state.items) {
                    if (!state.items.hasOwnProperty(id)) continue;
                    var it = state.items[id];
                    if (it && it.course === courseName && !it.archived) {
                      it.archived = true;
                      count++;
                    }
                  }
                  saveState();
                  renderSidebar();
                  renderDashboard();
                  toast('Archived ' + count + ' cards');
                }
              },
              { icon: '✕', label: 'Cancel', action: function() {} }
            ]);
          }
        }
      ]);
    }

    function showCourseContextMenu(courseName, anchor) {
      showCtxMenuAt(anchor, [
        {
          icon: '⚙',
          label: 'Edit Details',
          action: function() {
            try { window.openEditCourseTab(courseName, 'details'); } catch (e1) {}
          }
        },
        {
          icon: '📥',
          label: 'Import Cards',
          action: function() {
            openModal('import', courseName);
          }
        },
        {
          icon: '📖',
          label: 'Import Lecture',
          action: function() {
            try { window.openEditCourseTab(courseName, 'syllabus'); } catch (e1) {}
          }
        },
        {
          icon: '📁',
          label: 'Add Subdeck',
          action: function() {
            sidebarExpanded[courseName] = true;
            renderSidebar();
            var freshNode = document.getElementById('sidebarTree')
              ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="course"][data-course="' + esc(courseName) + '"]')
              : null;
            showInlineSidebarInput(freshNode, 'Subdeck name...', function(name) {
              addModuleToCourse(courseName, { name: name, topics: [], lectureImported: false });
              renderSidebar();
              toast('Created subdeck: ' + name);
            });
          }
        },
        { divider: true },
        {
          icon: '📦',
          label: 'Archive Course',
          action: function() {
            archiveCourse(courseName);
          }
        },
        {
          icon: '🗑',
          label: 'Delete Course',
          danger: true,
          action: function() {
            openDeleteCoursePrompt(courseName);
          }
        }
      ]);
    }

    function showModuleContextMenu(courseName, moduleId, anchor) {
      var mod = getModuleById(courseName, moduleId);
      if (!mod) return;

      showCtxMenuAt(anchor, [
        {
          icon: '✏',
          label: 'Rename',
          action: function() {
            var modNode = document.getElementById('sidebarTree')
              ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="module"][data-module="' + esc(moduleId) + '"]')
              : null;
            showInlineSidebarInput(modNode, mod.name || 'Subdeck name...', function(newName) {
              renameModule(courseName, moduleId, newName);
              renderSidebar();
              toast('Renamed to: ' + newName);
            });
          }
        },
        {
          icon: '📖',
          label: 'Import Lecture Here',
          action: function() {
            try { openCourseModal && openCourseModal(); } catch (e1) {}
            setTimeout(function() {
              try { window.openEditCourse && window.openEditCourse(courseName); } catch (e2) {}
            }, 120);
          }
        },
        { divider: true },
        {
          icon: '🗑',
          label: 'Delete Subdeck',
          danger: true,
          action: function() {
            showCtxMenuAt(anchor, [
              {
                icon: '⚠',
                label: 'Confirm: Delete "' + (mod.name || '') + '"?',
                danger: true,
                action: function() {
                  removeModuleFromCourse(courseName, moduleId);
                  sidebarSelection = { level: 'course', course: courseName, module: null, topic: null };
                  renderSidebar();
                  updateBreadcrumb();
                  applySidebarFilter();
                  toast('Deleted subdeck');
                }
              },
              { icon: '✕', label: 'Cancel', action: function() {} }
            ]);
          }
        }
      ]);
    }
