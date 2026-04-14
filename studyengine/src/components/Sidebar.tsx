import { useComputed } from '@preact/signals';
import { coursesList, sidebarExpanded, sidebarSelection, selectedCourse } from '../signals';
import { getTopicsForCourse, getCourseColor } from '../logic/courses';
import { listCourses } from '../logic/courses';

export function Sidebar() {
  const courses = useComputed(() => coursesList.value);
  const expanded = useComputed(() => sidebarExpanded.value);

  const handleCourseClick = (courseName: string) => {
    sidebarSelection.value = {
      level: 'course',
      course: courseName,
      module: null,
      topic: null,
      subDeck: null
    };
    selectedCourse.value = courseName;
    sidebarExpanded.value = {
      ...sidebarExpanded.value,
      [courseName]: !sidebarExpanded.value[courseName]
    };
  };

  const handleAllCoursesClick = () => {
    sidebarSelection.value = {
      level: 'all',
      course: null,
      module: null,
      topic: null,
      subDeck: null
    };
    selectedCourse.value = 'All';
  };

  return (
    <aside class="sidebar" id="sidebar" aria-label="Sidebar">
      <div class="sb-header">
        <div class="logo" aria-hidden="true">◆</div>
        <h1 class="sb-brand">STUDY ENGINE</h1>
      </div>

      <nav class="sb-tree" id="sidebarTree" aria-label="Course tree">
        <div
          class="tree-node depth-0 tree-node-hoverable tree-node-root-actions active"
          onClick={handleAllCoursesClick}
        >
          <span class="tree-icon">📚</span>
          <span class="tree-label">All Courses</span>
        </div>
        <div class="tree-section-divider" />

        {courses.value.map((course) => (
          <div key={course.name}>
            <div
              class="tree-node depth-0 tree-node-hoverable"
              data-level="course"
              data-course={course.name}
              onClick={() => handleCourseClick(course.name)}
            >
              <span
                class={`tree-chevron ${expanded.value[course.name] ? 'expanded' : ''}`}
              />
              <span class="tree-icon" style={{ color: course.color || '#8b5cf6' }}>
                ●
              </span>
              <span class="tree-label">{course.name}</span>
            </div>

            {expanded.value[course.name] && (
              <div class="tree-children">
                {getTopicsForCourse(course.name).map((topic) => (
                  <div
                    key={topic}
                    class="tree-node depth-1"
                    data-level="topic"
                    data-course={course.name}
                    data-topic={topic}
                  >
                    <span class="tree-label">{topic}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div class="sb-footer">
        <button class="sb-footer-btn" type="button">
          <span aria-hidden="true">＋</span>
          <span>Add Card</span>
        </button>
        <button class="sb-footer-btn" type="button">
          <span aria-hidden="true">⚙</span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
