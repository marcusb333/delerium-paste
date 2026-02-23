/**
 * app.ts - ZKPaste client-side application
 * 
 * Main entry point for the ZKPaste web client.
 * Wires dependencies and initializes presentation components.
 * 
 * Security model:
 * - All encryption happens in the browser
 * - The encryption key never leaves the client (stored in URL fragment)
 * - The server only stores encrypted content (zero-knowledge)
 * - Privacy-preserving validation without content analysis
 */

import { 
  onDomReady,
  setupCharCounter,
  setupViewCopyButton,
  setupUrlInputSelection,
  setupSingleViewToggle,
  setupExpirationPresets,
  setupNewPasteButton
} from './ui/dom-helpers.js';

import { initializeWindowUI } from './ui/ui-manager.js';
import { applyPassiveEventsPatch } from './utils/passive-events.js';
import { PasteCreatorView } from './presentation/components/paste-creator-view.js';
import { PasteViewerView } from './presentation/components/paste-viewer-view.js';
import { ChatView } from './presentation/components/chat-view.js';
import { CreatePasteUseCase } from './application/use-cases/create-paste-use-case.js';
import { ViewPasteUseCase } from './application/use-cases/view-paste-use-case.js';
import { DeletePasteUseCase } from './application/use-cases/delete-paste-use-case.js';
import { ChatUseCase } from './application/use-cases/chat-use-case.js';
import { EncryptionService } from './core/services/encryption-service.js';
import { PasteService } from './core/services/paste-service.js';
import { HttpApiClient } from './infrastructure/api/http-client.js';
import { InlinePowSolver } from './infrastructure/pow/inline-solver.js';
import type { PasteMetadata } from './core/models/paste.js';

const MAX_CONTENT_CHARACTERS = 1048576;

const apiClient = new HttpApiClient();
const powSolver = new InlinePowSolver();
const encryptionService = new EncryptionService();
const pasteService = new PasteService();

const createPasteUseCase = new CreatePasteUseCase(apiClient, powSolver, encryptionService, pasteService);
const viewPasteUseCase = new ViewPasteUseCase(apiClient, encryptionService);
const deletePasteUseCase = new DeletePasteUseCase(apiClient);
const chatUseCase = new ChatUseCase(encryptionService);

const creatorView = new PasteCreatorView(createPasteUseCase);
const viewerView = new PasteViewerView(viewPasteUseCase, deletePasteUseCase);
const chatView = new ChatView(chatUseCase);

function shouldInitChat(meta: PasteMetadata): boolean {
  return viewerView.shouldInitChat(meta);
}

async function viewPaste(): Promise<void> {
  if (!location.pathname.endsWith('view.html')) return;

  const result = await viewerView.handleView();

  if (result && shouldInitChat(result.metadata)) {
    chatView.setup(result.pasteId, result.salt, result.initialPassword);
  }
}

function initializeApp(): void {
  applyPassiveEventsPatch();
  initializeWindowUI();
  
  onDomReady(() => {
    setupCharCounter(MAX_CONTENT_CHARACTERS);
    setupViewCopyButton();
    setupUrlInputSelection();
    setupSingleViewToggle();
    setupExpirationPresets();
    setupNewPasteButton();
  });
  
  creatorView.setup();
  void viewPaste();
}

if (typeof window !== 'undefined') {
  initializeApp();
}
