/**
 * paste-creator.test.ts - Tests for paste creation (meta includes allowChat)
 */

import { PasteCreatorView } from '../../../src/presentation/components/paste-creator-view.js';
import { CreatePasteUseCase } from '../../../src/application/use-cases/create-paste-use-case.js';
import { EncryptionService } from '../../../src/core/services/encryption-service.js';
import { PasteService } from '../../../src/core/services/paste-service.js';
import * as security from '../../../src/security.js';
import * as api from '../../../src/infrastructure/api/http-client.js';
import * as validators from '../../../src/core/validators/index.js';
import * as uiManager from '../../../src/ui/ui-manager.js';
import * as storage from '../../../src/utils/storage.js';
import { InlinePowSolver } from '../../../src/infrastructure/pow/inline-solver.js';

describe('paste-creator allowChat', () => {
  let createPasteSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    createPasteSpy = jest.spyOn(api.HttpApiClient.prototype, 'createPaste').mockResolvedValue({
      id: 'test-id',
      deleteToken: 'test-token'
    });
    jest.spyOn(api.HttpApiClient.prototype, 'getPowChallenge').mockResolvedValue(null);
    jest.spyOn(security, 'encryptWithPassword').mockResolvedValue({
      encryptedData: new ArrayBuffer(0),
      salt: new ArrayBuffer(16),
      iv: new ArrayBuffer(12)
    });
    jest.spyOn(security, 'deriveDeleteAuth').mockResolvedValue('derived-auth');
    jest.spyOn(security, 'secureClear').mockImplementation(() => {});
    jest.spyOn(validators, 'validateContentSize').mockReturnValue({ isValid: true, errors: [] });
    jest.spyOn(validators, 'validateExpiration').mockReturnValue({ isValid: true, errors: [] });
    jest.spyOn(validators, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
    jest.spyOn(validators, 'isValidUTF8').mockReturnValue(true);
    jest.spyOn(uiManager, 'showLoading').mockImplementation(() => {});
    jest.spyOn(uiManager, 'showError').mockImplementation(() => {});
    jest.spyOn(uiManager, 'showSuccess').mockImplementation(() => {});
    jest.spyOn(storage, 'storeDeleteToken').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setupForm() {
    jest.spyOn(document, 'getElementById').mockImplementation((id: string) => {
      const els: Record<string, Partial<HTMLInputElement & HTMLTextAreaElement>> = {
        paste: { value: 'hello' },
        mins: { value: '60' },
        password: { value: 'pass123' }
      };
      return els[id] as HTMLElement ?? null;
    });
  }

  it('should send allowChat true in meta when creating a paste', async () => {
    setupForm();
    const client = new api.HttpApiClient();
    const useCase = new CreatePasteUseCase(client, new InlinePowSolver(), new EncryptionService(), new PasteService());
    const view = new PasteCreatorView(useCase);
    await view.handleSubmit();
    expect(createPasteSpy).toHaveBeenCalled();
    const call = createPasteSpy.mock.calls[0][0];
    expect(call.meta.allowChat).toBe(true);
  });
});
