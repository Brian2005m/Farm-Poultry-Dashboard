(function () {
  const STORAGE_PREFIX = 'farm-poultry-';

  const FarmUI = {
    async checkBackendHealth() {
      try {
        const response = await fetch('/api/health', {
          headers: { Accept: 'application/json' }
        });

        if (!response.ok) {
          throw new Error('Backend unavailable');
        }

        return await response.json();
      } catch (error) {
        return null;
      }
    },

    readStorage(key, fallback = null) {
      try {
        const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        return fallback;
      }
    },

    writeStorage(key, value) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    },

    removeStorage(key) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    }
  };

  if (typeof window !== 'undefined') {
    window.FarmUI = FarmUI;
  }
})();
