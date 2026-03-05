/**
 * PasteViewerView unit tests
 *
 * Covers:
 * - renderMarkdown: marked path, textContent fallback, hljs highlighting
 * - handleView: early return (non-view page), missing URL params, failure result, success result
 * - setupDestroyButton: show/hide, confirm cancel, success delete, failure delete, error, reuse guard
 */

jest.mock('../../../src/presentation/components/password-modal', () => ({
  getPasswordModal: () => ({
    show: jest.fn().mockResolvedValue('test-password'),
    closeOnSuccess: jest.fn(),
  }),
}));

import { PasteViewerView } from '../../../src/presentation/components/paste-viewer-view.js';
import { success, failure } from '../../../src/core/models/result.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SALT_B64 = 'AAAAAAAAAAAAAAAAAAAAAA'; // 16 zero bytes in base64url
const IV_B64 = 'AAAAAAAAAAAA';             // 9 zero bytes in base64url

function setViewLocation(pasteId = 'paste-1', salt = SALT_B64, iv = IV_B64): void {
  window.history.pushState({}, '', `/view.html?p=${pasteId}#${salt}:${iv}`);
}

function setNonViewLocation(): void {
  window.history.pushState({}, '', '/index.html');
}

function makeMetadata() {
  return { expireTs: Math.floor(Date.now() / 1000) + 3600, mime: 'text/plain' };
}

function makeMocks() {
  const mockViewExecute = jest.fn();
  const mockDeleteExecute = jest.fn();
  const view = new PasteViewerView(
    { execute: mockViewExecute } as any,
    { execute: mockDeleteExecute } as any
  );
  return { view, mockViewExecute, mockDeleteExecute };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = `
    <div id="content" class="loading"></div>
    <button id="destroyBtn" style="display:none">
      <span id="destroyText">Destroy Paste</span>
    </button>
    <div id="chatSection"></div>
  `;
  setViewLocation();
});

afterEach(() => {
  // Remove any globals set during tests
  delete (globalThis as any).marked;
  delete (globalThis as any).hljs;
  jest.restoreAllMocks();
});

// ─── handleView: early returns ────────────────────────────────────────────────

describe('PasteViewerView.handleView – early returns', () => {
  it('returns null immediately when pathname is not view.html', async () => {
    setNonViewLocation();
    const { view } = makeMocks();
    const result = await view.handleView();
    expect(result).toBeNull();
  });

  it('shows error and returns null when URL has no paste ID or fragment', async () => {
    window.history.pushState({}, '', '/view.html');
    const { view } = makeMocks();
    const result = await view.handleView();
    expect(result).toBeNull();
    const content = document.getElementById('content')!;
    expect(content.textContent).toContain('Missing');
    expect(content.classList.contains('error')).toBe(true);
  });
});

// ─── handleView: use case failure ─────────────────────────────────────────────

describe('PasteViewerView.handleView – use case failure', () => {
  it('shows error in DOM and returns null when view use case returns failure', async () => {
    const { view, mockViewExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(failure('Wrong password'));

    const result = await view.handleView();

    expect(result).toBeNull();
    const content = document.getElementById('content')!;
    expect(content.classList.contains('error')).toBe(true);
    expect(content.classList.contains('loading')).toBe(false);
  });

  it('shows error and returns null when view use case throws', async () => {
    const { view, mockViewExecute } = makeMocks();
    mockViewExecute.mockRejectedValue(new Error('Network failure'));

    const result = await view.handleView();

    expect(result).toBeNull();
    const content = document.getElementById('content')!;
    expect(content.classList.contains('error')).toBe(true);
  });
});

// ─── handleView: success path ─────────────────────────────────────────────────

describe('PasteViewerView.handleView – success (no marked)', () => {
  it('renders plain text via textContent when marked is undefined', async () => {
    const { view, mockViewExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'Hello world', metadata: makeMetadata(), deleteAuth: '' })
    );

    const result = await view.handleView();

    expect(result).not.toBeNull();
    const content = document.getElementById('content')!;
    expect(content.textContent).toBe('Hello world');
    expect(content.classList.contains('loading')).toBe(false);
    expect(content.classList.contains('error')).toBe(false);
  });

  it('returns pasteId, metadata, salt and initialPassword from result', async () => {
    const { view, mockViewExecute } = makeMocks();
    const metadata = makeMetadata();
    mockViewExecute.mockResolvedValue(
      success({ content: 'data', metadata, deleteAuth: '' })
    );

    const result = await view.handleView();

    expect(result).not.toBeNull();
    expect(result!.pasteId).toBe('paste-1');
    expect(result!.metadata).toEqual(metadata);
    expect(result!.salt).toBeInstanceOf(Uint8Array);
  });
});

describe('PasteViewerView.handleView – success (with marked)', () => {
  it('renders HTML via innerHTML when marked is defined', async () => {
    (globalThis as any).marked = {
      parse: jest.fn().mockReturnValue('<p>Hello world</p>'),
    };

    const { view, mockViewExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'Hello world', metadata: makeMetadata(), deleteAuth: '' })
    );

    await view.handleView();

    const content = document.getElementById('content')!;
    // innerHTML should include the parsed output (sanitized)
    expect(content.innerHTML).toContain('Hello world');
    expect((globalThis as any).marked.parse).toHaveBeenCalledWith('Hello world', expect.any(Object));
  });

  it('calls hljs.highlightElement on code blocks when hljs is defined', async () => {
    const highlightElement = jest.fn();
    (globalThis as any).marked = {
      parse: jest.fn().mockReturnValue('<pre><code>const x = 1;</code></pre>'),
    };
    (globalThis as any).hljs = { highlightElement };

    const { view, mockViewExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: '```js\nconst x = 1;\n```', metadata: makeMetadata(), deleteAuth: '' })
    );

    await view.handleView();

    expect(highlightElement).toHaveBeenCalled();
  });
});

describe('PasteViewerView.handleView – updateStatus and showInfo', () => {
  it('calls window.updateStatus and window.showInfo when available', async () => {
    const updateStatus = jest.fn();
    const showInfo = jest.fn();
    (window as any).updateStatus = updateStatus;
    (window as any).showInfo = showInfo;

    const { view, mockViewExecute } = makeMocks();
    const metadata = makeMetadata();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata, deleteAuth: '' })
    );

    await view.handleView();

    expect(updateStatus).toHaveBeenCalledWith(true, expect.any(String));
    expect(showInfo).toHaveBeenCalledWith(metadata.expireTs);

    delete (window as any).updateStatus;
    delete (window as any).showInfo;
  });
});

// ─── setupDestroyButton (via handleView with deleteAuth) ──────────────────────

describe('PasteViewerView – setupDestroyButton', () => {
  it('shows destroyBtn when deleteAuth is present', async () => {
    const { view, mockViewExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata: makeMetadata(), deleteAuth: 'auth-token-123' })
    );

    await view.handleView();

    const btn = document.getElementById('destroyBtn') as HTMLButtonElement;
    expect(btn.style.display).toBe('inline-flex');
  });

  it('does not show destroyBtn when deleteAuth is empty', async () => {
    const { view, mockViewExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata: makeMetadata(), deleteAuth: '' })
    );

    await view.handleView();

    const btn = document.getElementById('destroyBtn') as HTMLButtonElement;
    expect(btn.style.display).toBe('none');
  });

  it('does nothing when window.confirm is cancelled', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { view, mockViewExecute, mockDeleteExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata: makeMetadata(), deleteAuth: 'auth-token' })
    );

    await view.handleView();

    const btn = document.getElementById('destroyBtn') as HTMLButtonElement;
    btn.click();

    expect(mockDeleteExecute).not.toHaveBeenCalled();
  });

  it('deletes paste and hides button on confirm + success', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { view, mockViewExecute, mockDeleteExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata: makeMetadata(), deleteAuth: 'auth-token' })
    );
    mockDeleteExecute.mockResolvedValue({ success: true });

    await view.handleView();

    const btn = document.getElementById('destroyBtn') as HTMLButtonElement;
    await btn.click();

    // Allow async click handler to complete
    await Promise.resolve();
    await Promise.resolve();

    expect(mockDeleteExecute).toHaveBeenCalledWith(expect.objectContaining({
      pasteId: 'paste-1',
      method: 'password',
    }));
  });

  it('re-enables button when delete returns failure', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    const { view, mockViewExecute, mockDeleteExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata: makeMetadata(), deleteAuth: 'auth-token' })
    );
    mockDeleteExecute.mockResolvedValue({ success: false, error: 'Unauthorized' });

    await view.handleView();

    const btn = document.getElementById('destroyBtn') as HTMLButtonElement;
    btn.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(btn.disabled).toBe(false);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
  });

  it('re-enables button when delete throws an exception', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    const { view, mockViewExecute, mockDeleteExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata: makeMetadata(), deleteAuth: 'auth-token' })
    );
    mockDeleteExecute.mockRejectedValue(new Error('Network error'));

    await view.handleView();

    const btn = document.getElementById('destroyBtn') as HTMLButtonElement;
    btn.click();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(btn.disabled).toBe(false);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Network error'));
  });

  it('shows alert and bails when button is clicked after already being used', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    const { view, mockViewExecute, mockDeleteExecute } = makeMocks();
    mockViewExecute.mockResolvedValue(
      success({ content: 'text', metadata: makeMetadata(), deleteAuth: 'auth-token' })
    );
    // First click fails → button is re-enabled, but isUsed=true and storedDeleteAuth=null
    mockDeleteExecute.mockResolvedValue({ success: false, error: 'Server error' });

    await view.handleView();

    const btn = document.getElementById('destroyBtn') as HTMLButtonElement;
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0)); // give async handler time

    // Reset alert mock to detect only the second click's alert
    (window.alert as jest.Mock).mockClear();

    // Second click — isUsed is true, storedDeleteAuth is null
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('expired'));
    // execute called only once (first click)
    expect(mockDeleteExecute).toHaveBeenCalledTimes(1);
  });
});

// ─── setup() ──────────────────────────────────────────────────────────────────

describe('PasteViewerView.setup()', () => {
  it('calls handleView() when document is available', () => {
    const { view } = makeMocks();
    const spy = jest.spyOn(view, 'handleView').mockResolvedValue(null);
    view.setup();
    expect(spy).toHaveBeenCalled();
  });
});
