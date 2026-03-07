/**
 * HTTP API Client Implementation
 * Uses fetch API for HTTP requests
 */

import type {
  IApiClient,
  CreatePasteRequest,
  CreatePasteResponse,
  GetPasteResponse,
  PowChallenge
} from './interfaces.js';

/**
 * HTTP-based API client using fetch
 */
export class HttpApiClient implements IApiClient {
  constructor(private baseUrl: string = '/api') {}

  async createPaste(request: CreatePasteRequest): Promise<CreatePasteResponse> {
    const response = await fetch(`${this.baseUrl}/pastes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      // Try to get error message from response body
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // If response is not JSON, use status text
        const text = await response.text().catch(() => '');
        if (text) {
          try {
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            errorMessage = text || errorMessage;
          }
        }
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /** Request timeout in ms (prevents indefinite hang on slow/unresponsive server) */
  private static readonly FETCH_TIMEOUT_MS = 30_000;

  /**
   * Retrieve a paste by ID
   */
  async retrievePaste(id: string): Promise<GetPasteResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HttpApiClient.FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/pastes/${encodeURIComponent(id)}`, {
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Request timed out. The server may be slow or unreachable. Please try again.', { cause: err });
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Content not found or has expired');
      }
      if (response.status === 410) {
        throw new Error('Content has expired');
      }
      if (response.status === 429) {
        throw new Error('Too many requests. Please try again later.');
      }
      let detail = '';
      try {
        const body = await response.json();
        detail = body.error || '';
      } catch { /* response may not be JSON */ }
      throw new Error(
        detail
          ? `Server error (${response.status}): ${detail}`
          : `Server error (${response.status}). Please try again later.`
      );
    }

    return response.json();
  }

  /**
   * Delete a paste
   */
  async deletePaste(id: string, token: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/pastes/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      { method: 'DELETE' }
    );

    if (!response.ok && response.status !== 204) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Invalid token or paste not found');
    }
  }

  /**
   * Get PoW challenge
   */
  async getPowChallenge(): Promise<PowChallenge | null> {
    const response = await fetch(`${this.baseUrl}/pow`);

    if (response.status === 204) {
      return null; // PoW disabled
    }

    if (!response.ok) {
      throw new Error('Failed to fetch PoW challenge');
    }

    return response.json();
  }

}
