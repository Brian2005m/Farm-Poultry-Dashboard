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

    async apiRequest(path, options = {}) {
      const response = await fetch(path, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload && payload.error ? payload.error : response.statusText || 'Request failed';
        throw new Error(message);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      return response.text();
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
      return value;
    },

    removeStorage(key) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    },

    getDashboardState(key, fallback = null) {
      return this.readStorage(`dashboard:${key}`, fallback);
    },

    saveDashboardState(key, value) {
      return this.writeStorage(`dashboard:${key}`, value);
    },

    async syncConsumerRecord(payload, method = 'POST') {
      const path = '/api/consumers';
      const requestMethod = method.toUpperCase();

      const init = {
        method: requestMethod,
        body: JSON.stringify(payload)
      };

      if (requestMethod === 'PUT' && payload && payload.id) {
        return this.apiRequest(`${path}/${payload.id}`, init);
      }

      return this.apiRequest(path, init);
    }
  };

  if (typeof window !== 'undefined') {
    window.FarmUI = FarmUI;
  }
})();
