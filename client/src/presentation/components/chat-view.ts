/**
 * Chat View Component
 * 
 * Presentation layer component for anonymous chat functionality.
 * Handles DOM manipulation and delegates business logic to use cases.
 */

import { ChatUseCase } from '../../application/use-cases/chat-use-case.js';
import { secureClear } from '../../security.js';
import { showPasswordModal } from './password-modal.js';
import { escapeText } from '../../core/utils/sanitize.js';

/**
 * Debug flag for verbose error logging
 */
const DEBUG_MODE = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Chat context
 */
interface ChatContext {
  pasteId: string;
  salt: Uint8Array;
  currentUsername?: string;
  /** Cached password from paste view - avoids repeated prompts for refresh/send */
  cachedPassword?: string;
}

/**
 * Return the default username for anonymous chat.
 */
export function generateRandomUsername(): string {
  return 'anon';
}

/**
 * Chat view component
 */
export class ChatView {
  private context: ChatContext | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private useCase: ChatUseCase) {}

  /**
   * Display decrypted messages in the chat UI
   */
  private displayMessages(messages: Array<{ text: string; username?: string; timestamp?: number }>): void {
    const messagesDiv = document.getElementById('chatMessages');
    if (!messagesDiv) return;

    if (messages.length === 0) {
      messagesDiv.innerHTML = '<div class="chat-empty">No messages yet. Be the first to chat!</div>';
      return;
    }

    let html = '';
    for (const msg of messages) {
      const date = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const username = msg.username || 'Anonymous';
      
      // Determine if message is from current user (simple heuristic: check if username matches context)
      const isCurrentUser = this.context?.currentUsername && username === this.context.currentUsername;
      const messageClass = isCurrentUser ? 'chat-message chat-message-sent' : 'chat-message chat-message-received';

      html += `
        <div class="${messageClass}">
          <div class="chat-message-header">
            <span class="chat-message-username">${escapeText(username)}</span>
            <span class="chat-message-timestamp">${escapeText(timeStr)}</span>
          </div>
          <div class="chat-message-content">${escapeText(msg.text)}</div>
        </div>
      `;
    }

    messagesDiv.innerHTML = html;

    // Scroll to bottom smoothly (guard for jsdom/test env where scrollTo may be missing)
    if (typeof messagesDiv.scrollTo === 'function') {
      messagesDiv.scrollTo({
        top: messagesDiv.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  /**
   * Show an error message in the chat UI
   */
  private showChatError(message: string): void {
    const messagesDiv = document.getElementById('chatMessages');
    if (!messagesDiv) return;

    messagesDiv.innerHTML = `
      <div class="chat-error">
        ⚠️ ${escapeText(message)}
      </div>
    `;
  }

  /**
   * Handle refreshing chat messages.
   * @param password Optional password override
   * @param silent When true, skip the loading indicator (used during background polling)
   */
  private async handleRefreshMessages(password?: string, silent = false): Promise<void> {
    if (!this.context) return;

    const messagesDiv = document.getElementById('chatMessages');
    if (!messagesDiv) return;

    let pwd = password ?? this.context.cachedPassword;

    // Prompt for password if not provided and not cached
    if (!pwd) {
      pwd = await showPasswordModal({
        title: 'Password Required',
        message: 'Enter the paste password to decrypt messages.',
        placeholder: 'Enter password or PIN'
      });
      if (!pwd) {
        this.showChatError('Password is required to decrypt messages');
        return;
      }
    }

    try {
      if (!silent) {
        messagesDiv.innerHTML = '<div class="chat-loading">Loading messages...</div>';
      }

      // Call use case
      const result = await this.useCase.refreshMessages(
        this.context.pasteId,
        pwd,
        this.context.salt
      );

      // Display messages
      this.displayMessages(result.messages);

      // Clear password after use (only if we prompted for it - not if cached or passed in)
      if (pwd && !password && pwd !== this.context?.cachedPassword) {
        secureClear(pwd);
      }
    } catch (error) {
      if (DEBUG_MODE) {
        console.error('Error refreshing messages:', error);
      } else {
        console.error('Error refreshing messages');
      }
      this.showChatError(error instanceof Error ? error.message : 'Failed to load messages');
      if (pwd && !password && pwd !== this.context?.cachedPassword) {
        secureClear(pwd);
      }
    }
  }

  /**
   * Handle sending a new chat message
   */
  private async handleSendMessage(input: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
    if (!this.context) return;

    const message = input.value.trim();

    if (!message) {
      return;
    }

    // Client-side validation: 1000 character limit
    if (message.length > 1000) {
      this.showChatError('Message too long (max 1000 characters)');
      return;
    }

    // Get username from input field or context
    const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
    const username = usernameInput?.value.trim() || this.context.currentUsername || generateRandomUsername();

    // Use cached password from paste view if available, otherwise prompt
    let password = this.context.cachedPassword;
    if (!password) {
      password = await showPasswordModal({
        title: 'Password Required',
        message: 'Enter the paste password to encrypt and send your message.',
        placeholder: 'Enter password or PIN'
      }) ?? undefined;
    }
    if (!password) {
      this.showChatError('Password is required to encrypt message');
      return;
    }

    try {
      // Disable input and button while sending
      input.disabled = true;
      const sendBtn = document.getElementById('sendMessageBtn') as HTMLButtonElement;
      if (sendBtn) sendBtn.disabled = true;

      // Call use case
      const result = await this.useCase.sendMessage(
        {
          pasteId: this.context.pasteId,
          message,
          username,
          password
        },
        this.context.salt
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      // Clear input and refresh messages
      input.value = '';
      await this.handleRefreshMessages(password);

      // Clear password after use (only if we prompted - not if it was cached)
      if (password !== this.context?.cachedPassword) {
        secureClear(password);
      }
    } catch (error) {
      if (DEBUG_MODE) {
        console.error('Error sending message:', error);
      } else {
        console.error('Error sending message');
      }
      this.showChatError(error instanceof Error ? error.message : 'Failed to send message');
      if (password !== this.context?.cachedPassword) {
        secureClear(password);
      }
    } finally {
      input.disabled = false;
      const sendBtn = document.getElementById('sendMessageBtn') as HTMLButtonElement;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  /**
   * Initialize chat functionality on view page.
   * Messages are loaded immediately, then refreshed every 30 seconds.
   * @param pasteId The paste ID
   * @param salt The salt from the paste URL for key derivation
   * @param initialPassword Optional password from paste view — avoids repeated prompts
   */
  setup(pasteId: string, salt: Uint8Array, initialPassword?: string): void {
    const chatSection = document.getElementById('chatSection');
    const sendBtn = document.getElementById('sendMessageBtn');
    const chatInput = document.getElementById('chatInput') as HTMLInputElement | HTMLTextAreaElement;
    const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
    const chatInfoText = document.getElementById('chatInfoText');

    if (!chatSection || !sendBtn || !chatInput) {
      console.warn('Chat UI elements not found');
      return;
    }

    // Guard against duplicate initialization
    if (chatSection.dataset.chatInitialized === 'true') {
      console.warn('Chat already initialized, skipping duplicate setup');
      return;
    }

    // Show chat section
    chatSection.style.display = 'block';

    // Store context (include cached password from paste view to avoid repeated prompts)
    this.context = {
      pasteId,
      salt,
      currentUsername: generateRandomUsername(),
      cachedPassword: initialPassword
    };

    // Clear cached password and stop polling on page unload
    const cleanup = (): void => {
      if (this.context?.cachedPassword) {
        secureClear(this.context.cachedPassword);
        this.context.cachedPassword = undefined;
      }
      if (this.pollInterval !== null) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
    };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    // Set auto-generated username in input field if it exists
    if (usernameInput) {
      usernameInput.value = this.context.currentUsername;
      // Update context when user edits username
      usernameInput.addEventListener('input', () => {
        if (this.context) {
          this.context.currentUsername = usernameInput.value.trim() || 'anon';
        }
      });
    }

    // Update info text
    if (chatInfoText) {
      chatInfoText.textContent = '💡 Messages are encrypted with your paste password. Auto-refreshing every 30 seconds.';
    }

    // Send message handler
    sendBtn.addEventListener('click', () => {
      void this.handleSendMessage(chatInput);
    });

    // Enter to send; Shift+Enter for new line (textarea)
    chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSendMessage(chatInput);
      }
    });

    // Mark as initialized to prevent duplicate listeners
    chatSection.dataset.chatInitialized = 'true';

    // Load messages immediately after paste is decrypted
    void this.handleRefreshMessages(initialPassword);

    // Poll for new messages every 30 seconds (silent — no loading indicator)
    this.pollInterval = setInterval(() => {
      void this.handleRefreshMessages(undefined, true);
    }, 30000);
  }
}
