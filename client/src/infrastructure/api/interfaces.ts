/**
 * API Client Interface
 * Allows swapping API implementations (fetch, axios, mock)
 */

import type {
  PowChallenge,
  PowSolution,
  CreatePasteRequest,
  CreatePasteResponse,
  GetPasteResponse
} from '../../core/models/paste.js';

export type {
  PowChallenge,
  PowSolution,
  CreatePasteRequest,
  CreatePasteResponse,
  GetPasteResponse
};

/**
 * API Client Interface
 */
export interface IApiClient {
  createPaste(request: CreatePasteRequest): Promise<CreatePasteResponse>;
  retrievePaste(id: string): Promise<GetPasteResponse>;
  deletePaste(id: string, token: string): Promise<void>;
  getPowChallenge(): Promise<PowChallenge | null>;
}
