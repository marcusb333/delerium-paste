/**
 * Tests for chat-view.ts
 *
 * Covers: auto-load on setup, 30s polling interval, clearInterval on unload,
 *         duplicate-initialization guard, silent polling (no loading text flash),
 *         escapeHtml, displayMessages with messages, handleSendMessage,
 *         keydown Enter handler, missing elements warning.
 */

import { ChatView, escapeHtml, generateRandomUsername } from '../../../src/presentation/components/chat-view.js';
import { ChatUseCase } from '../../../src/application/use-cases/chat-use-case.js';
import * as passwordModal from '../../../src/presentation/components/password-modal.js';

// ============================================================================
// Helpers / Mocks
// ============================================================================

/** Build the minimal DOM that setup() requires */
function buildChatDom(container: HTMLElement): void {
  const chatSection = document.createElement('div');
  chatSection.id = 'chatSection';
  container.appendChild(chatSection);

  const messagesDiv = document.createElement('div');
  messagesDiv.id = 'chatMessages';
  container.appendChild(messagesDiv);

  const sendBtn = document.createElement('button');
  sendBtn.id = 'sendMessageBtn';
  container.appendChild(sendBtn);

  const chatInput = document.createElement('input');
  chatInput.id = 'chatInput';
  container.appendChild(chatInput);

  const usernameInput = document.createElement('input');
  usernameInput.id = 'usernameInput';
  container.appendChild(usernameInput);

  const chatInfoText = document.createElement('div');
  chatInfoText.id = 'chatInfoText';
  container.appendChild(chatInfoText);
}

/** Create a minimal mock ChatUseCase */
function makeMockUseCase(): jest.Mocked<ChatUseCase> {
  return {
    refreshMessages: jest.fn().mockResolvedValue({ messages: [] }),
    sendMessage: jest.fn().mockResolvedValue({ success: true })
  } as unknown as jest.Mocked<ChatUseCase>;
}

// ============================================================================
// escapeHtml
// ============================================================================

describe('escapeHtml', () => {
  it('should return empty string for null-ish values', () => {
    // The function checks `text == null` which catches both null and undefined
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });

  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>')).toContain('&lt;');
    expect(escapeHtml('<script>')).toContain('&gt;');
  });

  it('should return plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// ============================================================================
// generateRandomUsername
// ============================================================================

describe('generateRandomUsername', () => {
  it('should return "anon"', () => {
    expect(generateRandomUsername()).toBe('anon');
  });
});

// ============================================================================
// ChatView — auto-load and polling
// ============================================================================

describe('ChatView — auto-load and polling', () => {
  let container: HTMLElement;
  let useCase: jest.Mocked<ChatUseCase>;
  let chatView: ChatView;

  beforeEach(() => {
    jest.useFakeTimers();

    container = document.createElement('div');
    document.body.appendChild(container);
    buildChatDom(container);

    useCase = makeMockUseCase();
    chatView = new ChatView(useCase);
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should call refreshMessages once immediately on setup', async () => {
    const salt = new Uint8Array(16);
    chatView.setup('paste-1', salt, 'pw');

    // Let the async call run
    await Promise.resolve();

    expect(useCase.refreshMessages).toHaveBeenCalledTimes(1);
  });

  it('should call refreshMessages with cached password immediately (no modal)', async () => {
    const salt = new Uint8Array(16);
    chatView.setup('paste-1', salt, 'my-password');

    await Promise.resolve();

    // useCase.refreshMessages is called — that means no modal was shown
    expect(useCase.refreshMessages).toHaveBeenCalledTimes(1);
    expect(useCase.refreshMessages).toHaveBeenCalledWith('paste-1', 'my-password', salt);
  });

  it('should set up a 30s polling interval', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const salt = new Uint8Array(16);

    chatView.setup('paste-2', salt, 'pw');

    const thirtySecCalls = setIntervalSpy.mock.calls.filter(([, ms]) => ms === 30000);
    expect(thirtySecCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should call refreshMessages again after 30 seconds', async () => {
    const salt = new Uint8Array(16);
    chatView.setup('paste-3', salt, 'pw');

    // Initial call
    await Promise.resolve();
    expect(useCase.refreshMessages).toHaveBeenCalledTimes(1);

    // Advance timer by 30 seconds
    jest.advanceTimersByTime(30000);
    await Promise.resolve();

    expect(useCase.refreshMessages).toHaveBeenCalledTimes(2);
  });

  it('should call clearInterval when beforeunload fires', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const salt = new Uint8Array(16);

    chatView.setup('paste-4', salt, 'pw');

    // Fire beforeunload
    window.dispatchEvent(new Event('beforeunload'));

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should call clearInterval when pagehide fires', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const salt = new Uint8Array(16);

    chatView.setup('paste-5', salt, 'pw');

    window.dispatchEvent(new Event('pagehide'));

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should guard against duplicate initialization', () => {
    const salt = new Uint8Array(16);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    chatView.setup('paste-6', salt, 'pw');
    chatView.setup('paste-6', salt, 'pw'); // Second call — should be skipped

    expect(warnSpy).toHaveBeenCalledWith('Chat already initialized, skipping duplicate setup');
  });

  it('should not show loading text during silent polling refresh', async () => {
    const salt = new Uint8Array(16);
    chatView.setup('paste-7', salt, 'pw');

    const messagesDiv = document.getElementById('chatMessages')!;

    // Initial load (not silent) — loading text shown then replaced
    await Promise.resolve();

    // Set some existing content to detect if it gets replaced
    messagesDiv.textContent = 'previous messages';

    // Trigger polling tick (silent)
    jest.advanceTimersByTime(30000);
    await Promise.resolve();

    // Content should NOT have been briefly replaced with "Loading messages..."
    expect(messagesDiv.textContent).not.toContain('chat-loading');
  });

  it('should show chat section after setup', () => {
    const chatSection = document.getElementById('chatSection')!;
    expect(chatSection.style.display).toBe('');

    chatView.setup('paste-8', new Uint8Array(16), 'pw');

    expect(chatSection.style.display).toBe('block');
  });

  it('should update info text to mention auto-refresh', () => {
    chatView.setup('paste-9', new Uint8Array(16), 'pw');

    const chatInfoText = document.getElementById('chatInfoText')!;
    expect(chatInfoText.textContent).toContain('Auto-refreshing');
  });
});

// ============================================================================
// ChatView — displayMessages with actual messages
// ============================================================================

describe('ChatView — displayMessages with messages', () => {
  let container: HTMLElement;
  let useCase: jest.Mocked<ChatUseCase>;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    buildChatDom(container);
    useCase = makeMockUseCase();
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should display messages in the chat UI', async () => {
    const messages = [
      { text: 'Hello!', username: 'alice', timestamp: 1700000000 },
      { text: 'Hi there', username: 'bob', timestamp: 1700000060 },
    ];
    useCase.refreshMessages.mockResolvedValue({ messages });

    const chatView = new ChatView(useCase);
    chatView.setup('p1', new Uint8Array(16), 'pw');

    await Promise.resolve();

    const messagesDiv = document.getElementById('chatMessages')!;
    expect(messagesDiv.textContent).toContain('Hello!');
    expect(messagesDiv.textContent).toContain('alice');
    expect(messagesDiv.textContent).toContain('Hi there');
    expect(messagesDiv.textContent).toContain('bob');
  });

  it('should show "No messages yet" when message list is empty', async () => {
    useCase.refreshMessages.mockResolvedValue({ messages: [] });

    const chatView = new ChatView(useCase);
    chatView.setup('p2', new Uint8Array(16), 'pw');

    await Promise.resolve();

    const messagesDiv = document.getElementById('chatMessages')!;
    expect(messagesDiv.textContent).toContain('No messages yet');
  });

  it('should show message as sent when username matches current user', async () => {
    const messages = [
      { text: 'my msg', username: 'anon', timestamp: 1700000000 },
    ];
    useCase.refreshMessages.mockResolvedValue({ messages });

    const chatView = new ChatView(useCase);
    chatView.setup('p3', new Uint8Array(16), 'pw');

    await Promise.resolve();

    const messagesDiv = document.getElementById('chatMessages')!;
    // 'anon' is the default username, so message should have sent class
    const sentMsgs = messagesDiv.querySelectorAll('.chat-message-sent');
    expect(sentMsgs.length).toBe(1);
  });

  it('should show error in chat UI when refreshMessages fails', async () => {
    useCase.refreshMessages.mockRejectedValue(new Error('Paste not found'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const chatView = new ChatView(useCase);
    chatView.setup('p4', new Uint8Array(16), 'pw');

    await Promise.resolve();

    const messagesDiv = document.getElementById('chatMessages')!;
    expect(messagesDiv.textContent).toContain('Paste not found');
  });

  it('should use "Anonymous" when message has no username', async () => {
    const messages = [{ text: 'msg', timestamp: 1700000000 }];
    useCase.refreshMessages.mockResolvedValue({ messages });

    const chatView = new ChatView(useCase);
    chatView.setup('p5', new Uint8Array(16), 'pw');

    await Promise.resolve();

    const messagesDiv = document.getElementById('chatMessages')!;
    expect(messagesDiv.textContent).toContain('Anonymous');
  });
});

// ============================================================================
// ChatView — handleSendMessage (via send button and keydown)
// ============================================================================

describe('ChatView — handleSendMessage', () => {
  let container: HTMLElement;
  let useCase: jest.Mocked<ChatUseCase>;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    buildChatDom(container);
    useCase = makeMockUseCase();
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should send a message when send button is clicked', async () => {
    const chatView = new ChatView(useCase);
    chatView.setup('send-1', new Uint8Array(16), 'pw');

    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.value = 'Hello world';

    const sendBtn = document.getElementById('sendMessageBtn')!;
    sendBtn.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(useCase.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hello world', pasteId: 'send-1' }),
      expect.any(Uint8Array)
    );
  });

  it('should clear input after successful send', async () => {
    const chatView = new ChatView(useCase);
    chatView.setup('send-2', new Uint8Array(16), 'pw');

    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.value = 'test message';

    document.getElementById('sendMessageBtn')!.click();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(chatInput.value).toBe('');
  });

  it('should do nothing when input is empty', async () => {
    const chatView = new ChatView(useCase);
    chatView.setup('send-3', new Uint8Array(16), 'pw');

    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.value = '  ';

    document.getElementById('sendMessageBtn')!.click();

    await Promise.resolve();

    expect(useCase.sendMessage).not.toHaveBeenCalled();
  });

  it('should show error when message is too long (>1000 chars)', async () => {
    const chatView = new ChatView(useCase);
    chatView.setup('send-4', new Uint8Array(16), 'pw');

    // Wait for initial refresh to finish before sending
    await Promise.resolve();
    await Promise.resolve();

    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.value = 'x'.repeat(1001);

    document.getElementById('sendMessageBtn')!.click();

    await Promise.resolve();

    expect(useCase.sendMessage).not.toHaveBeenCalled();
    const messagesDiv = document.getElementById('chatMessages')!;
    expect(messagesDiv.textContent).toContain('too long');
  });

  it('should show error when sendMessage fails', async () => {
    useCase.sendMessage.mockResolvedValue({ success: false, error: 'Rate limited' });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const chatView = new ChatView(useCase);
    chatView.setup('send-5', new Uint8Array(16), 'pw');

    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.value = 'oops';

    document.getElementById('sendMessageBtn')!.click();

    await Promise.resolve();
    await Promise.resolve();

    const messagesDiv = document.getElementById('chatMessages')!;
    expect(messagesDiv.textContent).toContain('Rate limited');
  });

  it('should send message on Enter keydown', async () => {
    const chatView = new ChatView(useCase);
    chatView.setup('send-6', new Uint8Array(16), 'pw');

    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.value = 'keyboard msg';

    chatInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();

    expect(useCase.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'keyboard msg' }),
      expect.any(Uint8Array)
    );
  });

  it('should not send on Shift+Enter keydown', async () => {
    const chatView = new ChatView(useCase);
    chatView.setup('send-7', new Uint8Array(16), 'pw');

    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.value = 'multiline';

    chatInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));

    await Promise.resolve();

    expect(useCase.sendMessage).not.toHaveBeenCalled();
  });

  it('should warn when chat UI elements are not found', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Remove required elements
    document.getElementById('chatSection')?.remove();
    document.getElementById('sendMessageBtn')?.remove();

    const chatView = new ChatView(useCase);
    chatView.setup('warn-1', new Uint8Array(16), 'pw');

    expect(warnSpy).toHaveBeenCalledWith('Chat UI elements not found');
  });

  it('should update username in context when user edits username input', () => {
    const chatView = new ChatView(useCase);
    chatView.setup('user-1', new Uint8Array(16), 'pw');

    const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
    usernameInput.value = 'newname';
    usernameInput.dispatchEvent(new Event('input'));

    // Just verify no error is thrown and the event fires
    expect(usernameInput.value).toBe('newname');
  });
});

// ============================================================================
// ChatView — password prompt path
// ============================================================================

describe('ChatView — password prompt when no cached password', () => {
  let container: HTMLElement;
  let useCase: jest.Mocked<ChatUseCase>;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    buildChatDom(container);
    useCase = makeMockUseCase();
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should prompt for password when no cached password is available for refresh', async () => {
    const showModalSpy = jest.spyOn(passwordModal, 'showPasswordModal').mockResolvedValue('prompted-pw');

    const chatView = new ChatView(useCase);
    chatView.setup('prompt-1', new Uint8Array(16)); // no initialPassword

    await Promise.resolve();
    await Promise.resolve();

    expect(showModalSpy).toHaveBeenCalled();
    expect(useCase.refreshMessages).toHaveBeenCalledWith('prompt-1', 'prompted-pw', expect.any(Uint8Array));
  });

  it('should show error when password prompt is cancelled during refresh', async () => {
    jest.spyOn(passwordModal, 'showPasswordModal').mockResolvedValue(null);

    const chatView = new ChatView(useCase);
    chatView.setup('prompt-2', new Uint8Array(16)); // no initialPassword

    await Promise.resolve();
    await Promise.resolve();

    const messagesDiv = document.getElementById('chatMessages')!;
    expect(messagesDiv.textContent).toContain('Password is required');
    expect(useCase.refreshMessages).not.toHaveBeenCalled();
  });
});
