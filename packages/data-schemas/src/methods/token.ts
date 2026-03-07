import type { QueryOptions } from 'mongoose';
import { IToken, TokenCreateData, TokenQuery, TokenUpdateData, TokenDeleteResult } from '~/types';
import logger from '~/config/winston';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Factory function that takes mongoose instance and returns the methods
export function createTokenMethods(mongoose: typeof import('mongoose')) {
  /**
   * Creates a new Token instance.
   */
  async function createToken(tokenData: TokenCreateData): Promise<IToken> {
    try {
      const Token = mongoose.models.Token;
      const currentTime = new Date();
      const expiresAt = new Date(currentTime.getTime() + tokenData.expiresIn * 1000);

      const newTokenData = {
        ...tokenData,
        createdAt: currentTime,
        expiresAt,
      };

      return await Token.create(newTokenData);
    } catch (error) {
      logger.debug('An error occurred while creating token:', error);
      throw error;
    }
  }

  /**
   * Updates a Token document that matches the provided query.
   */
  async function updateToken(
    query: TokenQuery,
    updateData: TokenUpdateData,
  ): Promise<IToken | null> {
    try {
      const Token = mongoose.models.Token;

      const dataToUpdate = { ...updateData };
      if (updateData?.expiresIn !== undefined) {
        dataToUpdate.expiresAt = new Date(Date.now() + updateData.expiresIn * 1000);
      }

      return await Token.findOneAndUpdate(query, dataToUpdate, { new: true });
    } catch (error) {
      logger.debug('An error occurred while updating token:', error);
      throw error;
    }
  }

  /**
   * Deletes all Token documents that match the provided token, user ID, or email.
   * Email is automatically normalized to lowercase for case-insensitive matching.
   */
  async function deleteTokens(query: TokenQuery): Promise<TokenDeleteResult> {
    try {
      const Token = mongoose.models.Token;
      const conditions = [];

      if (query.userId !== undefined) {
        conditions.push({ userId: query.userId });
      }
      if (query.type !== undefined) {
        conditions.push({ type: query.type });
      }
      if (query.token !== undefined) {
        conditions.push({ token: query.token });
      }
      if (query.email !== undefined) {
        conditions.push({ email: query.email.trim().toLowerCase() });
      }
      if (query.identifier !== undefined) {
        conditions.push({ identifier: query.identifier });
      }

      /**
       * If no conditions are specified, throw an error to prevent accidental deletion of all tokens
       */
      if (conditions.length === 0) {
        throw new Error('At least one query parameter must be provided');
      }

      return await Token.deleteMany({
        $or: conditions,
      });
    } catch (error) {
      logger.debug('An error occurred while deleting tokens:', error);
      throw error;
    }
  }

  /**
   * Finds a Token document that matches the provided query.
   * Email is automatically normalized to lowercase for case-insensitive matching.
   */
  async function findToken(query: TokenQuery, options?: QueryOptions): Promise<IToken | null> {
    try {
      const Token = mongoose.models.Token;
      const conditions = [];

      if (query.userId) {
        conditions.push({ userId: query.userId });
      }
      if (query.type) {
        conditions.push({ type: query.type });
      }
      if (query.token) {
        conditions.push({ token: query.token });
      }
      if (query.email) {
        conditions.push({ email: query.email.trim().toLowerCase() });
      }
      if (query.identifier) {
        conditions.push({ identifier: query.identifier });
      }
      if (query.identifierPrefix) {
        conditions.push({ identifier: new RegExp(`^${escapeRegex(query.identifierPrefix)}`) });
      }

      const token = await Token.findOne({ $and: conditions }, null, options).lean();

      return token as IToken | null;
    } catch (error) {
      logger.debug('An error occurred while finding token:', error);
      throw error;
    }
  }

  /**
   * Finds all Token documents matching the query. Supports identifierPrefix for
   * listing tokens by prefix (e.g. mcp:Google: for all Google accounts).
   */
  async function findTokens(query: TokenQuery, options?: QueryOptions): Promise<IToken[]> {
    try {
      const Token = mongoose.models.Token;
      const conditions: Record<string, unknown>[] = [];

      if (query.userId) {
        conditions.push({ userId: query.userId });
      }
      if (query.type) {
        conditions.push({ type: query.type });
      }
      if (query.token) {
        conditions.push({ token: query.token });
      }
      if (query.email) {
        conditions.push({ email: query.email.trim().toLowerCase() });
      }
      if (query.identifier) {
        conditions.push({ identifier: query.identifier });
      }
      if (query.identifierPrefix) {
        conditions.push({ identifier: new RegExp(`^${escapeRegex(query.identifierPrefix)}`) });
      }

      const tokens = await Token.find({ $and: conditions }, null, options).lean();
      return tokens as IToken[];
    } catch (error) {
      logger.debug('An error occurred while finding tokens:', error);
      throw error;
    }
  }

  // Return all methods
  return {
    findToken,
    findTokens,
    createToken,
    updateToken,
    deleteTokens,
  };
}

export type TokenMethods = ReturnType<typeof createTokenMethods>;
