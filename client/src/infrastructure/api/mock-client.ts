/**
 * Mock API Client for Testing
 * Simulates API responses without making real HTTP requests
 */

import type {
  IApiClient,
  CreatePasteRequest,
  CreatePasteResponse,
  GetPasteResponse,
  PowChallenge
} from './interfaces.js';
import type { PasteMetadata } from '../../core/models/paste.js';

/**
 * Mock API client for testing
 */
export class MockApiClient implements IApiClient {
  private pastes = new Map<string, { ct: string; iv: string; meta: PasteMetadata; deleteToken: string }>();
  private powEnabled = false;
  private nextId = 1;

  setPowEnabled(enabled: boolean): void {
    this.powEnabled = enabled;
  }

  async createPaste(request: CreatePasteRequest): Promise<CreatePasteResponse> {
    const id = `mock-${this.nextId++}`;
    const deleteToken = `token-${Math.random().toString(36).substring(7)}`;
    
    this.pastes.set(id, {
      ct: request.ct,
      iv: request.iv,
      meta: request.meta,
      deleteToken
    });

    return { id, deleteToken };
  }

  async retrievePaste(id: string): Promise<GetPasteResponse> {
    const paste = this.pastes.get(id);
    
    if (!paste) {
      throw new Error('Content not found or has expired');
    }

    return {
      ct: paste.ct,
      iv: paste.iv,
      meta: paste.meta
    };
  }

  /**
   * Delete a paste
   */
  async deletePaste(id: string, token: string): Promise<void> {
    const paste = this.pastes.get(id);
    
    if (!paste) {
      throw new Error('Paste not found');
    }

    if (paste.deleteToken !== token) {
      throw new Error('Invalid token');
    }

    this.pastes.delete(id);
  }

  /**
   * Get PoW challenge
   */
  async getPowChallenge(): Promise<PowChallenge | null> {
    if (!this.powEnabled) {
      return null;
    }

    return {
      challenge: `mock-challenge-${Date.now()}`,
      difficulty: 4
    };
  }

  /**
   * Clear all stored pastes (for testing)
   */
  clear(): void {
    this.pastes.clear();
    this.nextId = 1;
  }

  /**
   * Get number of stored pastes (for testing)
   */
  size(): number {
    return this.pastes.size;
  }
}
