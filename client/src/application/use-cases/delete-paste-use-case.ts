/**
 * Delete Paste Use Case
 * 
 * Orchestrates paste deletion workflow:
 * - Token-based deletion (creator only)
 * - Password-based deletion (anyone with password)
 */

import type { IApiClient } from '../../infrastructure/api/interfaces.js';
import type { DeletePasteCommand } from '../dtos/paste-dtos.js';

/**
 * Use case for deleting a paste
 */
export class DeletePasteUseCase {
  constructor(private apiClient: IApiClient) {}

  /**
   * Execute paste deletion workflow
   * 
   * @param command Delete paste command
   * @returns Promise resolving to success or error
   */
  async execute(command: DeletePasteCommand): Promise<{ success: boolean; error?: string }> {
    try {
      if (command.method === 'token') {
        // Token-based deletion (creator only)
        await this.apiClient.deletePaste(command.pasteId, command.tokenOrPassword);
        return { success: true };
      } else {
        // Password-based deletion (anyone with password)
        // Note: deleteAuth is derived in the presentation layer and passed here
        await this.apiClient.deleteByPassword(command.pasteId, command.tokenOrPassword);
        return { success: true };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
}
