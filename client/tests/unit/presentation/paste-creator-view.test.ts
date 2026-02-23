/**
 * Tests for paste-creator-view.ts
 *
 * Covers: editor tab toggle, markdown toolbar, paste creation form submission,
 *         submit from Preview tab (switches to Write, reads content correctly),
 *         handleSubmit error paths, setup save button click.
 */

import { PasteCreatorView } from '../../../src/presentation/components/paste-creator-view.js';
import { CreatePasteUseCase } from '../../../src/application/use-cases/create-paste-use-case.js';
import * as uiManager from '../../../src/ui/ui-manager.js';
import * as storage from '../../../src/utils/storage.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(tag: string, id: string, attrs: Record<string, string> = {}): T {
  const elem = document.createElement(tag) as T;
  elem.id = id;
  for (const [k, v] of Object.entries(attrs)) {
    (elem as unknown as Record<string, string>)[k] = v;
  }
  return elem;
}

/** Build minimum DOM needed for most tests */
function buildFullDom(): void {
  document.body.replaceChildren();

  const textarea = el<HTMLTextAreaElement>('textarea', 'paste');
  textarea.value = 'some content';
  document.body.appendChild(textarea);

  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-toolbar';
  document.body.appendChild(toolbar);

  const writeTab = el<HTMLButtonElement>('button', 'writeTab');
  writeTab.classList.add('active');
  document.body.appendChild(writeTab);

  const previewTab = el<HTMLButtonElement>('button', 'previewTab');
  document.body.appendChild(previewTab);

  const preview = el<HTMLDivElement>('div', 'markdownPreview');
  preview.hidden = true;
  document.body.appendChild(preview);

  const mdToolbar = el<HTMLElement>('div', 'markdownToolbar');
  document.body.appendChild(mdToolbar);

  const minsInput = el<HTMLInputElement>('input', 'mins');
  minsInput.value = '60';
  document.body.appendChild(minsInput);

  const passwordInput = el<HTMLInputElement>('input', 'password');
  passwordInput.value = '';
  document.body.appendChild(passwordInput);

  const saveBtn = el<HTMLButtonElement>('button', 'save');
  document.body.appendChild(saveBtn);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PasteCreatorView', () => {
  const mockUseCase = {
    execute: jest.fn()
  } as unknown as CreatePasteUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(uiManager, 'showLoading').mockImplementation(() => {});
    jest.spyOn(uiManager, 'showError').mockImplementation(() => {});
    jest.spyOn(uiManager, 'showSuccess').mockImplementation(() => {});
    jest.spyOn(storage, 'storeDeleteToken').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
  });

  describe('setup', () => {
    it('should not throw when document elements are missing', () => {
      jest.spyOn(document, 'getElementById').mockReturnValue(null);
      const view = new PasteCreatorView(mockUseCase);
      expect(() => view.setup()).not.toThrow();
    });

    it('should wire save button click to handleSubmit', async () => {
      buildFullDom();
      (mockUseCase.execute as jest.Mock).mockResolvedValue({
        value: { id: 'x', deleteToken: 'y', shareUrl: 'u', deleteUrl: 'd' }
      });
      const view = new PasteCreatorView(mockUseCase);
      view.setup();

      const saveBtn = document.getElementById('save')!;
      saveBtn.click();

      await new Promise(r => setTimeout(r, 0));

      expect(mockUseCase.execute).toHaveBeenCalled();
    });
  });

  describe('setupEditorTabs', () => {
    it('should return early when required elements are missing', () => {
      jest.spyOn(document, 'getElementById').mockReturnValue(null);
      const view = new PasteCreatorView(mockUseCase);
      expect(() => view.setupEditorTabs()).not.toThrow();
    });

    it('should switch to preview when previewTab is clicked', () => {
      buildFullDom();
      const view = new PasteCreatorView(mockUseCase);
      view.setupEditorTabs();

      const previewTab = document.getElementById('previewTab')!;
      const writeTab = document.getElementById('writeTab')!;
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      const preview = document.getElementById('markdownPreview') as HTMLDivElement;

      previewTab.click();

      expect(previewTab.classList.contains('active')).toBe(true);
      expect(writeTab.classList.contains('active')).toBe(false);
      expect(textarea.hidden).toBe(true);
      expect(preview.hidden).toBe(false);
    });

    it('should switch back to write when writeTab is clicked', () => {
      buildFullDom();
      const view = new PasteCreatorView(mockUseCase);
      view.setupEditorTabs();

      document.getElementById('previewTab')!.click();
      document.getElementById('writeTab')!.click();

      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      const preview = document.getElementById('markdownPreview') as HTMLDivElement;

      expect(textarea.hidden).toBe(false);
      expect(preview.hidden).toBe(true);
    });

    it('should render content into preview on preview tab click', () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = 'hello world';
      const view = new PasteCreatorView(mockUseCase);
      view.setupEditorTabs();

      document.getElementById('previewTab')!.click();

      const preview = document.getElementById('markdownPreview') as HTMLDivElement;
      expect(preview.childNodes.length).toBeGreaterThan(0);
    });
  });

  describe('setupMarkdownToolbar', () => {
    it('should return early when elements are missing', () => {
      document.body.replaceChildren();
      const view = new PasteCreatorView(mockUseCase);
      expect(() => view.setupMarkdownToolbar()).not.toThrow();
    });

    it('should insert text when toolbar button with data-insert is clicked', () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = 'before';
      textarea.setSelectionRange(6, 6);

      const toolbar = document.querySelector('.markdown-toolbar')!;
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.dataset.insert = '---';
      toolbar.appendChild(btn);

      const view = new PasteCreatorView(mockUseCase);
      view.setupMarkdownToolbar();

      btn.click();

      expect(textarea.value).toContain('---');
    });

    it('should wrap selection when toolbar button with data-wrap is clicked', () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = 'hello world';
      textarea.setSelectionRange(0, 5);

      const toolbar = document.querySelector('.markdown-toolbar')!;
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.dataset.wrap = '**';
      toolbar.appendChild(btn);

      const view = new PasteCreatorView(mockUseCase);
      view.setupMarkdownToolbar();

      btn.click();

      expect(textarea.value).toContain('**hello**');
    });

    it('should use placeholder when no text is selected and wrap is clicked', () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = '';
      textarea.setSelectionRange(0, 0);

      const toolbar = document.querySelector('.markdown-toolbar')!;
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.dataset.wrap = '**';
      btn.dataset.placeholder = 'bold text';
      toolbar.appendChild(btn);

      const view = new PasteCreatorView(mockUseCase);
      view.setupMarkdownToolbar();

      btn.click();

      expect(textarea.value).toContain('**bold text**');
    });

    it('should handle block insert with newline prefix when line has content', () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = 'existing';
      textarea.setSelectionRange(8, 8);

      const toolbar = document.querySelector('.markdown-toolbar')!;
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.dataset.wrap = '```\\n';
      btn.dataset.wrapEnd = '\\n```';
      btn.dataset.placeholder = 'code';
      btn.setAttribute('data-block', '');
      toolbar.appendChild(btn);

      const view = new PasteCreatorView(mockUseCase);
      view.setupMarkdownToolbar();

      btn.click();

      expect(textarea.value.length).toBeGreaterThan(8);
    });

    it('should do nothing when click target is not a toolbar button', () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = 'original';

      const toolbar = document.querySelector('.markdown-toolbar')!;
      const span = document.createElement('span');
      toolbar.appendChild(span);

      const view = new PasteCreatorView(mockUseCase);
      view.setupMarkdownToolbar();

      toolbar.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(textarea.value).toBe('original');
    });
  });

  describe('handleSubmit', () => {
    it('should read content and create paste when Preview tab is active (textarea hidden)', async () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = '**hello** world';
      textarea.hidden = true;

      (mockUseCase.execute as jest.Mock).mockResolvedValue({
        value: { id: 'x', deleteToken: 'y', shareUrl: 'u', deleteUrl: 'd' }
      });

      const view = new PasteCreatorView(mockUseCase);
      await view.handleSubmit();

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ content: '**hello** world' })
      );
    });

    it('should switch to Write tab before submitting when Preview is active', async () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = 'content';
      textarea.hidden = true;
      const preview = document.getElementById('markdownPreview') as HTMLDivElement;

      (mockUseCase.execute as jest.Mock).mockResolvedValue({
        value: { id: 'x', deleteToken: 'y', shareUrl: 'u', deleteUrl: 'd' }
      });

      const view = new PasteCreatorView(mockUseCase);
      await view.handleSubmit();

      expect(textarea.hidden).toBe(false);
      expect(preview.hidden).toBe(true);
    });

    it('should show error when use case returns a failure result', async () => {
      buildFullDom();

      (mockUseCase.execute as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Content is too large'
      });

      const view = new PasteCreatorView(mockUseCase);
      await view.handleSubmit();

      expect(uiManager.showError).toHaveBeenCalledWith('Content is too large');
    });

    it('should show error when use case throws an exception', async () => {
      buildFullDom();

      (mockUseCase.execute as jest.Mock).mockRejectedValue(new Error('Network failure'));

      const view = new PasteCreatorView(mockUseCase);
      await view.handleSubmit();

      expect(uiManager.showError).toHaveBeenCalledWith('Network failure');
    });

    it('should clear textarea after successful submission', async () => {
      buildFullDom();
      const textarea = document.getElementById('paste') as HTMLTextAreaElement;
      textarea.value = 'some content';

      (mockUseCase.execute as jest.Mock).mockResolvedValue({
        success: true,
        value: { id: 'abc', deleteToken: 'tok', shareUrl: '/view?p=abc', deleteUrl: '/delete?p=abc' }
      });

      const view = new PasteCreatorView(mockUseCase);
      await view.handleSubmit();

      expect(textarea.value).toBe('');
    });

    it('should call showLoading false in finally block even on error', async () => {
      buildFullDom();

      (mockUseCase.execute as jest.Mock).mockRejectedValue(new Error('oops'));

      const view = new PasteCreatorView(mockUseCase);
      await view.handleSubmit();

      expect(uiManager.showLoading).toHaveBeenCalledWith(false);
    });
  });
});
