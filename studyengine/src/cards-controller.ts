import { openModal, closeModal, addFromModal, doImport, switchModalTab } from './cards';

type Win = Window & typeof globalThis & {
  openModal?: (tab?: string, course?: string) => void;
  closeModal?: () => void;
  addFromModal?: (stay?: boolean) => void;
  doImport?: () => void;
  switchModalTab?: (tab: string) => void;
  openImportModal?: () => void;
};

export function initCardsController(): void {
  const w = window as Win;
  w.openModal = openModal;
  w.closeModal = closeModal;
  w.addFromModal = addFromModal;
  w.doImport = doImport;
  w.switchModalTab = switchModalTab;
  w.openImportModal = () => openModal('import');

  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('addNextBtn')?.addEventListener('click', () => addFromModal(true));
  document.getElementById('doneBtn')?.addEventListener('click', () => addFromModal());

  document.getElementById('modalTabs')?.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const t = tab.getAttribute('data-tab');
      if (t) switchModalTab(t);
    });
  });

  document.getElementById('modalOv')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOv')) closeModal();
  });
}
