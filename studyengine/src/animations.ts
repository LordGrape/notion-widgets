type TeardownFn = () => void;

type ListenerBinding = {
  element: HTMLElement;
  type: keyof HTMLElementEventMap;
  listener: EventListener;
};

type GsapAnimVars = {
  [key: string]: string | number | boolean | (() => void) | undefined;
};

type GsapLike = {
  to(targets: Element | Element[] | HTMLElement | HTMLElement[], vars: GsapAnimVars): unknown;
  from(targets: Element | Element[] | HTMLElement | HTMLElement[], vars: GsapAnimVars): unknown;
  fromTo(
    targets: Element | Element[] | HTMLElement | HTMLElement[],
    fromVars: GsapAnimVars,
    toVars: GsapAnimVars,
    position?: number,
  ): unknown;
  timeline(): {
    fromTo(
      targets: Element | Element[] | HTMLElement | HTMLElement[],
      fromVars: GsapAnimVars,
      toVars: GsapAnimVars,
      position?: number,
    ): unknown;
  };
};

function resolveRoot(scope?: string): ParentNode {
  if (!scope) return document;
  return document.querySelector(scope) ?? document;
}

export function animateHeaderEntrance(selector: string): void {
  const gsapInstance = window.gsap as GsapLike | undefined;
  if (!gsapInstance) return;

  const headers = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (!headers.length) return;

  headers.forEach((header) => {
    gsapInstance.from(header, {
      y: 15,
      opacity: 0,
      filter: 'blur(6px)',
      duration: 0.7,
      ease: 'power3.out',
      onComplete: () => {
        header.classList.add('header-shimmer');
      },
    });
  });
}

export function animateEmptyStateEntrance(containerSelector: string): void {
  const gsapInstance = window.gsap as GsapLike | undefined;
  if (!gsapInstance) return;
  const container = document.querySelector<HTMLElement>(containerSelector);
  if (!container) return;

  const icon = container.querySelector<HTMLElement>('.dcr-icon, .empty-icon, [data-empty-icon]');
  const heading = container.querySelector<HTMLElement>('.dcr-title, .empty-title, h2, h3');
  const description = container.querySelector<HTMLElement>('.dcr-subtitle, .empty-desc, p');
  const buttonGroup = container.querySelector<HTMLElement>('.dcr-actions, .empty-actions, [data-empty-actions]');
  const tipText = container.querySelector<HTMLElement>('.dcr-hint, .empty-hint, .tip, [data-empty-tip]');
  const buttons = buttonGroup ? Array.from(buttonGroup.querySelectorAll<HTMLElement>('button, .btn, .action-btn')) : [];

  const timeline = gsapInstance.timeline();

  timeline.fromTo(
    container,
    { scale: 0.97, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.5, ease: 'power2.out' },
  );

  if (icon) {
    timeline.fromTo(icon, { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0.15);
  }

  if (heading) {
    timeline.fromTo(heading, { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, 0.25);
    timeline.fromTo(heading, { filter: 'blur(8px)' }, { filter: 'blur(0px)', duration: 0.5 }, 0.25);
  }

  if (description) {
    timeline.fromTo(description, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0.4);
  }

  if (buttons.length > 0) {
    timeline.fromTo(
      buttons,
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.1 },
      0.55,
    );
  }

  if (tipText) {
    timeline.fromTo(tipText, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.75);
  }
}

export function setupButtonMicroInteractions(scope?: string): TeardownFn {
  const gsapInstance = window.gsap as GsapLike | undefined;
  if (!gsapInstance) return () => {};
  const root = resolveRoot(scope);
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('.btn, button, .action-btn'));
  const bindings: ListenerBinding[] = [];

  const addBinding = (element: HTMLElement, type: keyof HTMLElementEventMap, listener: EventListener): void => {
    element.addEventListener(type, listener);
    bindings.push({ element, type, listener });
  };

  buttons.forEach((button) => {
    const onMouseEnter: EventListener = () => {
      gsapInstance.to(button, { scale: 1.03, duration: 0.2, ease: 'power2.out' });
      button.classList.add('btn-glow');
    };

    const onMouseLeave: EventListener = () => {
      gsapInstance.to(button, { scale: 1, duration: 0.3, ease: 'power2.inOut' });
      button.classList.remove('btn-glow');
    };

    const onMouseDown: EventListener = () => {
      gsapInstance.to(button, { scale: 0.97, duration: 0.1 });
    };

    const onMouseUp: EventListener = () => {
      gsapInstance.to(button, { scale: 1.03, duration: 0.15 });
    };

    addBinding(button, 'mouseenter', onMouseEnter);
    addBinding(button, 'mouseleave', onMouseLeave);
    addBinding(button, 'mousedown', onMouseDown);
    addBinding(button, 'mouseup', onMouseUp);
  });

  return () => {
    bindings.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
  };
}

export function animateSidebarActiveIndicator(activeItemSelector: string, indicatorSelector: string): void {
  const gsapInstance = window.gsap as GsapLike | undefined;
  if (!gsapInstance) return;
  const activeItem = document.querySelector<HTMLElement>(activeItemSelector);
  const indicator = document.querySelector<HTMLElement>(indicatorSelector);
  if (!indicator) return;

  if (!activeItem) {
    gsapInstance.to(indicator, { opacity: 0, duration: 0.2, ease: 'power2.out' });
    return;
  }

  gsapInstance.to(indicator, {
    y: activeItem.offsetTop,
    opacity: 1,
    duration: 0.3,
    ease: 'power3.out',
  });
}

export function initPageAnimations(): void {
  animateHeaderEntrance('.main-topbar-title, .topbar-title');
  setupButtonMicroInteractions();
}
