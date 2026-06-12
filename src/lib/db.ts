// File: src/lib/db.ts

import { ChatMessage } from '../types';

const DB_NAME = 'langgraph_ide_db';
const STORE_NAME = 'chat_messages';
const SQLITE_STORE_NAME = 'sqlite_backup';
const DB_VERSION = 3; // Upgrade DB to version 3 to add SQLITE_STORE_NAME

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      reject(new Error('IndexedDB failed to open: ' + (event.target as any).error?.message));
    };

    request.onsuccess = (event) => {
      resolve((event.target as any).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as any).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SQLITE_STORE_NAME)) {
        db.createObjectStore(SQLITE_STORE_NAME);
      }
    };
  });
}

/**
 * Retrieves the raw serialized SQLite database binary from IndexedDB.
 */
export async function getSQLiteBackup(): Promise<Uint8Array | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SQLITE_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SQLITE_STORE_NAME);
      const request = store.get('db_binary');

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as Uint8Array);
        } else {
          resolve(null);
        }
      };

      request.onerror = (event) => {
        reject(new Error('Failed to load SQLite backup: ' + (event.target as any).error?.message));
      };
    });
  } catch (e) {
    console.error('IndexedDB getSQLiteBackup error:', e);
    return null;
  }
}

/**
 * Persists the serialized SQLite database binary to IndexedDB.
 */
export async function saveSQLiteBackup(data: Uint8Array): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SQLITE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SQLITE_STORE_NAME);
      const request = store.put(data, 'db_binary');

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        reject(new Error('Failed to save SQLite backup: ' + (event.target as any).error?.message));
      };
    });
  } catch (e) {
    console.error('IndexedDB saveSQLiteBackup error:', e);
  }
}

/**
 * Retrieves all saved chat messages from IndexedDB, ordered chronologically by timestamp
 */
export async function getStoredChat(): Promise<ChatMessage[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const messages = request.result as ChatMessage[];
        // Always sort messages by timestamp just in case
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(messages);
      };

      request.onerror = (event) => {
        reject(new Error('Failed to get chat messages: ' + (event.target as any).error?.message));
      };
    });
  } catch (e) {
    console.error('IndexedDB getStoredChat error:', e);
    return [];
  }
}

/**
 * Persists a single message to IndexedDB
 */
export async function saveMessage(message: ChatMessage): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(message);

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        reject(new Error('Failed to save message: ' + (event.target as any).error?.message));
      };
    });
  } catch (e) {
    console.error('IndexedDB saveMessage error:', e);
  }
}

/**
 * Performs a bulk save of all messages, clearing the store first to ensure clean state matching
 */
export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const clearReq = store.clear();
      
      clearReq.onsuccess = () => {
        if (messages.length === 0) {
          resolve();
          return;
        }

        for (const message of messages) {
          store.put(message);
        }

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = (event) => {
          reject(new Error('Transaction failed during saveChatHistory: ' + (event.target as any).error?.message));
        };
      };

      clearReq.onerror = (event) => {
        reject(new Error('Clear failed during saveChatHistory: ' + (event.target as any).error?.message));
      };
    });
  } catch (e) {
    console.error('saveChatHistory exception:', e);
  }
}

/**
 * Erases all chat entries
 */
export async function clearChat(): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        reject(new Error('Failed to clear chat: ' + (event.target as any).error?.message));
      };
    });
  } catch (e) {
    console.error('IndexedDB clearChat error:', e);
  }
}
