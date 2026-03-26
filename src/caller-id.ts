const STORAGE_KEY = "mcb_caller_id";

/**
 * Returns a persistent caller ID from localStorage.
 * Generates and stores a new one if none exists.
 * Falls back to a random ID if localStorage is unavailable.
 */
export function defaultCallerId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id =
        "mcb_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).substring(2, 11);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return (
      "mcb_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).substring(2, 11)
    );
  }
}
