import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';
import { Drawer } from './Drawer';

vi.mock('next-intl', () => ({ useLocale: () => 'uz', useTranslations: () => (key: string) => key }));

function renderModal(props: { confirmDiscard?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <Modal isOpen onClose={onClose} title="Yangi mijoz" confirmDiscard={props.confirmDiscard}>
      <input aria-label="Nomi" />
    </Modal>,
  );
  return onClose;
}

/** Typing into a field (input event bubbles to the dialog). */
function typeInto(el: HTMLElement, value: string) {
  fireEvent.input(el, { target: { value } });
}

describe('Modal: closing without losing typed input', () => {
  it('Esc closes at once when nothing was typed', () => {
    const onClose = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('after typing, Esc / ✕ ask first; "Davom etish" keeps the dialog, "Yopish" closes it', () => {
    const onClose = renderModal();
    typeInto(screen.getByLabelText('Nomi'), 'Baraka');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Saqlamasdan yopilsinmi/);

    fireEvent.click(screen.getByRole('button', { name: 'Davom etish' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yopish' })); // the ✕ in the header
    expect(onClose).not.toHaveBeenCalled();
    const prompt = screen.getByRole('alert');
    fireEvent.click(Array.from(prompt.querySelectorAll('button')).find((b) => b.textContent === 'Yopish')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a press inside the dialog released on the backdrop does not close it', () => {
    const onClose = renderModal();
    const backdrop = document.querySelector('.app-modal-backdrop') as HTMLElement;
    fireEvent.mouseDown(screen.getByLabelText('Nomi'));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    // a real click on the backdrop still closes
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirmDiscard={false} closes without asking', () => {
    const onClose = renderModal({ confirmDiscard: false });
    typeInto(screen.getByLabelText('Nomi'), 'x');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal: what counts as an edit', () => {
  it('typing in a search box is not an edit (Esc closes at once)', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Sahifaga o‘tish">
        <input type="search" aria-label="Qidiruv" />
      </Modal>,
    );
    fireEvent.input(screen.getByLabelText('Qidiruv'), { target: { value: 'sotuv' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('picking a choice in a custom control (role=option, even in a portal) is an edit', () => {
    const onClose = vi.fn();
    render(
      <>
        <Modal isOpen onClose={onClose} title="Yangi hujjat">
          <span>Ombor</span>
        </Modal>
        <ul role="listbox">
          <li role="option" aria-selected="false">Asosiy ombor</li>
        </ul>
      </>,
    );
    fireEvent.click(screen.getByRole('option', { name: 'Asosiy ombor' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('Drawer: same rules', () => {
  it('asks before closing after typing; the close button is named in the interface language', () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Kirim qo‘shish">
        <input aria-label="Summa" />
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Kirim qo‘shish' })).toBeTruthy();
    typeInto(screen.getByLabelText('Summa'), '100');
    fireEvent.click(screen.getByRole('button', { name: 'Yopish' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
