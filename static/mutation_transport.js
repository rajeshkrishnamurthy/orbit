function postBody(payload) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

const ENDPOINTS = {
  contexts: '/api/contexts',
  items: '/api/items',
  itemsHidden: '/api/items/hidden',
  itemsResurfaced: '/api/items/resurfaced',
  itemsHide: '/api/items/hide',
  itemsDelete: '/api/items/delete',
  itemsActivityLogAdd: '/api/items/activity-log/add',
  itemsActivityLogLatest: '/api/items/activity-log/latest',
  contextsDelete: '/api/contexts/delete',
  itemsComplete: '/api/items/complete',
  itemsTouch: '/api/items/touch',
  itemsTouchUndo: '/api/items/touch/undo',
  itemsUnhideAt: '/api/items/unhide-at',
  itemsRefreshForeground: '/api/items/refresh-foreground',
};

async function readTextSafe(response) {
  return response.text().catch(() => '');
}

async function readJSONSafe(response) {
  return response.json().catch(() => null);
}

export function mutationErrorSummary(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch (_jsonErr) {
    return String(err);
  }
}

export function logMutationFailure({ operation, id, contextId, endpoint, status, error }) {
  const payload = {
    operation: operation || '',
    id: id || '',
    contextId: contextId || '',
    endpoint: endpoint || '',
    status: Number.isFinite(status) ? Number(status) : null,
    error: error || '',
  };
  console.error('[mutation-failure]', JSON.stringify(payload));
}

export function createMutationTransport({ fetchImpl } = {}) {
  const doFetch = fetchImpl || window.fetch.bind(window);
  const saveEndpointForMode = (mode) => (mode === 'focus' ? ENDPOINTS.items : ENDPOINTS.contexts);

  async function saveEntityByEndpoint(endpoint, payload) {
    try {
      const response = await doFetch(endpoint, postBody(payload));
      const status = response.status;
      if (!response.ok) {
        const detail = await readTextSafe(response);
        return { ok: false, status, endpoint, error: detail || `save failed (${status})` };
      }
      const data = await readJSONSafe(response);
      return { ok: true, status, endpoint, data };
    } catch (err) {
      return { ok: false, status: null, endpoint, error: mutationErrorSummary(err) };
    }
  }

  return {
    mutationErrorSummary,
    logMutationFailure,

    async saveContextTitle({ contextId, title }) {
      try {
        const response = await doFetch(ENDPOINTS.contexts, postBody({ id: contextId, title }));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.contexts, error: detail || `context title save failed (${status})` };
        }
        return { ok: true, status, endpoint: ENDPOINTS.contexts };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.contexts, error: mutationErrorSummary(err) };
      }
    },

    async loadHiddenItems({ contextId }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsHidden, postBody({ contextId }));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsHidden, error: detail || `hidden load failed (${status})` };
        }
        const data = await response.json();
        return { ok: true, status, endpoint: ENDPOINTS.itemsHidden, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsHidden, error: mutationErrorSummary(err) };
      }
    },

    async loadResurfacedItems({ contextId }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsResurfaced, postBody({ contextId }));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsResurfaced, error: detail || `resurfaced load failed (${status})` };
        }
        const data = await response.json();
        return { ok: true, status, endpoint: ENDPOINTS.itemsResurfaced, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsResurfaced, error: mutationErrorSummary(err) };
      }
    },

    saveModeEntity({ mode, payload }) {
      return saveEntityByEndpoint(saveEndpointForMode(mode), payload);
    },

    async hideItem({ id, contextId, snoozeUntil }) {
      try {
        const payload = { id, contextId };
        if (snoozeUntil) payload.snoozeUntil = snoozeUntil;
        const response = await doFetch(ENDPOINTS.itemsHide, postBody(payload));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsHide, error: detail || `hide failed (${status})` };
        }
        const data = await readJSONSafe(response);
        return { ok: true, status, endpoint: ENDPOINTS.itemsHide, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsHide, error: mutationErrorSummary(err) };
      }
    },

    async loadLatestActivityLog({ itemId }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsActivityLogLatest, postBody({ itemId }));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsActivityLogLatest, error: detail || `activity log load failed (${status})` };
        }
        const data = await readJSONSafe(response);
        return { ok: true, status, endpoint: ENDPOINTS.itemsActivityLogLatest, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsActivityLogLatest, error: mutationErrorSummary(err) };
      }
    },

    async appendActivityLog({ itemId, body }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsActivityLogAdd, postBody({ itemId, body }));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsActivityLogAdd, error: detail || `activity log save failed (${status})` };
        }
        const data = await readJSONSafe(response);
        return { ok: true, status, endpoint: ENDPOINTS.itemsActivityLogAdd, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsActivityLogAdd, error: mutationErrorSummary(err) };
      }
    },

    async deleteEntity({ mode, id }) {
      const endpoint = mode === 'focus' ? ENDPOINTS.itemsDelete : ENDPOINTS.contextsDelete;
      try {
        const response = await doFetch(endpoint, postBody({ id }));
        const status = response.status;
        if (response.ok) {
          return { ok: true, status, endpoint };
        }
        if (mode !== 'contexts') {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint, error: detail || `delete failed (${status})` };
        }
      } catch (err) {
        return {
          ok: false,
          status: null,
          endpoint,
          error: mutationErrorSummary(err),
          warningMessage: mode === 'contexts' ? 'Unable to delete context. Please try again.' : '',
        };
      }

      const fallbackEndpoint = ENDPOINTS.contextsDelete + '?id=' + encodeURIComponent(id);
      try {
        const retry = await doFetch(fallbackEndpoint);
        if (retry.ok) {
          return { ok: true, status: retry.status, endpoint: fallbackEndpoint };
        }
        const message = await readTextSafe(retry);
        return {
          ok: false,
          status: retry.status,
          endpoint: ENDPOINTS.contextsDelete + '?id=...',
          error: message || `delete context failed (${retry.status})`,
          warningMessage: message || 'Unable to delete context',
        };
      } catch (err) {
        return {
          ok: false,
          status: null,
          endpoint: ENDPOINTS.contextsDelete + '?id=...',
          error: mutationErrorSummary(err),
          warningMessage: 'Unable to delete context. Please try again.',
        };
      }
    },

    async restoreDeleted({ mode, payload }) {
      const endpoint = mode === 'focus' ? ENDPOINTS.items : ENDPOINTS.contexts;
      try {
        const response = await doFetch(endpoint, postBody(payload));
        const status = response.status;
        if (!response.ok) {
          const message = await readTextSafe(response);
          return {
            ok: false,
            status,
            endpoint,
            error: message || (mode === 'focus' ? 'Unable to restore deleted card.' : 'Unable to restore deleted context.'),
          };
        }
        return { ok: true, status, endpoint };
      } catch (_err) {
        return {
          ok: false,
          status: null,
          endpoint,
          error: mode === 'focus'
            ? 'Unable to restore deleted card. Please try again.'
            : 'Unable to restore deleted context. Please try again.',
        };
      }
    },

    async setItemCompleted({ id, completed }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsComplete, postBody({ id, completed }));
        const status = response.status;
        if (!response.ok) {
          const message = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsComplete, error: message };
        }
        return { ok: true, status, endpoint: ENDPOINTS.itemsComplete };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsComplete, error: mutationErrorSummary(err) };
      }
    },

    async touchItem({ id }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsTouch, postBody({ id }));
        const status = response.status;
        if (!response.ok) {
          const message = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsTouch, error: message };
        }
        const data = await response.json();
        return { ok: true, status, endpoint: ENDPOINTS.itemsTouch, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsTouch, error: mutationErrorSummary(err) };
      }
    },

    async undoTouchItem({ id }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsTouchUndo, postBody({ id }));
        const status = response.status;
        if (!response.ok) {
          const message = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsTouchUndo, error: message };
        }
        const data = await response.json();
        return { ok: true, status, endpoint: ENDPOINTS.itemsTouchUndo, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsTouchUndo, error: mutationErrorSummary(err) };
      }
    },

    async unhideItemAt({ id, contextId, x, y }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsUnhideAt, postBody({ id, contextId, x, y }));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsUnhideAt, error: detail || `unhide failed (${status})` };
        }
        const data = await readJSONSafe(response);
        return { ok: true, status, endpoint: ENDPOINTS.itemsUnhideAt, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsUnhideAt, error: mutationErrorSummary(err) };
      }
    },

    async refreshForeground({ contextId }) {
      try {
        const response = await doFetch(ENDPOINTS.itemsRefreshForeground, postBody({ contextId }));
        const status = response.status;
        if (!response.ok) {
          const detail = await readTextSafe(response);
          return { ok: false, status, endpoint: ENDPOINTS.itemsRefreshForeground, error: detail || `foreground refresh failed (${status})` };
        }
        const data = await readJSONSafe(response);
        return { ok: true, status, endpoint: ENDPOINTS.itemsRefreshForeground, data };
      } catch (err) {
        return { ok: false, status: null, endpoint: ENDPOINTS.itemsRefreshForeground, error: mutationErrorSummary(err) };
      }
    },

    deleteEntityFireAndForget({ mode, id, contextId }) {
      const endpoint = mode === 'focus' ? ENDPOINTS.itemsDelete : ENDPOINTS.contextsDelete;
      doFetch(endpoint, postBody({ id, contextId }));
    },
  };
}
