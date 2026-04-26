export type JolWidgetHandle = {
  mount(container: HTMLElement, onSubmit: (predicted: number) => void): void;
  unmount(): void;
};

export function createJolWidget(): JolWidgetHandle {
  let root: HTMLElement | null = null;
  let submitHandler: ((evt: Event) => void) | null = null;

  return {
    mount(container: HTMLElement, onSubmit: (predicted: number) => void): void {
      this.unmount();
      const wrapper = document.createElement('div');
      wrapper.className = 'jol-widget';
      wrapper.innerHTML = `
        <label style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px;">
          <span>How likely are you to remember this in 7 days?</span>
          <strong data-jol-value>50%</strong>
        </label>
        <input data-jol-slider type="range" min="0" max="100" step="5" value="50" style="width:100%;" />
        <button data-jol-submit type="button" class="ghost-btn" style="margin-top:8px;">Lock in prediction</button>
      `;
      const slider = wrapper.querySelector('[data-jol-slider]') as HTMLInputElement;
      const value = wrapper.querySelector('[data-jol-value]') as HTMLElement;
      const submit = wrapper.querySelector('[data-jol-submit]') as HTMLButtonElement;
      slider.addEventListener('input', () => {
        value.textContent = `${slider.value}%`;
      });
      submitHandler = () => onSubmit(Number(slider.value));
      submit.addEventListener('click', submitHandler);
      container.appendChild(wrapper);
      root = wrapper;
    },
    unmount(): void {
      if (root && root.parentElement) {
        root.parentElement.removeChild(root);
      }
      root = null;
      submitHandler = null;
    }
  };
}
