/* @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { createJolWidget } from './jol-ui';

describe('createJolWidget', () => {
  it('mounts and submits slider value', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cb = vi.fn();
    const widget = createJolWidget();
    widget.mount(host, cb);

    const slider = host.querySelector('[data-jol-slider]') as HTMLInputElement;
    const submit = host.querySelector('[data-jol-submit]') as HTMLButtonElement;
    slider.value = '85';
    slider.dispatchEvent(new Event('input'));
    submit.click();

    expect(cb).toHaveBeenCalledWith(85);
    widget.unmount();
    expect(host.children.length).toBe(0);
  });
});
