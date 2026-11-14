const working = phase => ['downloading', 'waiting', 'installing'].includes(phase);

export function createAppUpdater({ native, busy = () => '', onState = () => {}, onLock = () => {} }) {
  let disposed = false;
  let attempt = 0;
  let state = { phase: 'idle', currentVersion: '', update: null, notice: false, percent: null, error: '', checkedAt: null };
  const set = patch => { if (!disposed) { state = { ...state, ...patch }; onState(state); } };
  return {
    get state() { return state; },
    async check() {
      if (disposed || working(state.phase) || state.phase === 'checking') return;
      set({ phase: 'checking', error: '' });
      try {
        if (native.version) set({ currentVersion: await native.version() });
        const result = await native.check();
        set({ currentVersion: result.currentVersion, update: result.version ? result : null,
          notice: Boolean(result.version), checkedAt: Date.now(),
          phase: !result.supported ? 'unsupported' : result.version ? 'available' : 'current' });
      } catch (error) { set({ phase: 'error', error: `Gagal memeriksa update: ${error.message || error}` }); }
    },
    postpone() { set({ notice: false }); },
    async install() {
      if (disposed || !state.update || working(state.phase) || state.phase === 'checking') return;
      const reason = busy();
      if (reason) { set({ error: `${reason}. Selesaikan terlebih dahulu sebelum memasang update.` }); return; }
      const id = ++attempt;
      set({ phase: 'downloading', percent: null, error: '' }); onLock(true);
      try {
        await native.download(event => {
          if (disposed || id !== attempt || state.phase !== 'downloading') return;
          if (event.event === 'Progress') set({ percent: event.total > 0 ? Math.min(100, Math.round(event.downloaded * 100 / event.total)) : null });
        });
        if (disposed) return;
        set({ phase: 'waiting' });
        await native.install(event => {
          if (disposed || id !== attempt || !['waiting', 'installing'].includes(state.phase)) return;
          set({ phase: event.event === 'Installing' ? 'installing' : 'waiting' });
        });
        set({ phase: 'installed', notice: false });
      } catch (error) {
        attempt++;
        let recovery = '';
        try { await native.cancel(); } catch (failure) { recovery = ` Pemulihan backend: ${failure.message || failure}`; }
        set({ phase: 'error', error: `Update gagal: ${error.message || error}.${recovery}` });
      } finally { attempt++; onLock(false); }
    },
    dispose() { disposed = true; attempt++; },
  };
}

export function updateBusyReason(state) {
  if (state.session || state.capturing) return 'Sesi foto sedang aktif';
  if (state.printing) return 'Pencetakan sedang berjalan';
  if (state.saving) return 'Penyimpanan atau unggahan sedang berjalan';
  return '';
}
