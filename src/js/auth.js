/* ── CC.Inc Authentication ── */
const Auth = {
  _session: null,

  init() {
    this._session = JSON.parse(localStorage.getItem('ccinc_session') || 'null');
  },

  isLoggedIn() {
    return !!this._session;
  },

  getUser() {
    return this._session;
  },

  async login(username, password) {
    const hash = await Utils.sha256(password);
    const res = await DB.get('SELECT id, username, role FROM admins WHERE username = ? AND password_hash = ?', [username, hash]);
    if (!res.success || !res.result) {
      return { success: false, error: 'Invalid username or password' };
    }
    this._session = res.result;
    localStorage.setItem('ccinc_session', JSON.stringify(this._session));
    return { success: true };
  },

  logout() {
    this._session = null;
    localStorage.removeItem('ccinc_session');
    App.navigate('login');
  },

  renderLogin() {
    return `
      <div class="login-bg fade-in">
        <div class="login-card card card-glow">
          <div class="login-logo">cc<span>.inc</span></div>
          <p class="login-sub">Crowd Flow Management System</p>
          <div id="login-error" class="login-error hidden"></div>
          <form id="login-form">
            <div class="form-group">
              <label for="login-user">Username</label>
              <input class="input" id="login-user" type="text" placeholder="Enter username" autocomplete="username" required>
            </div>
            <div class="form-group">
              <label for="login-pass">Password</label>
              <input class="input" id="login-pass" type="password" placeholder="Enter password" autocomplete="current-password" required>
            </div>
            <button class="btn btn-primary w-full btn-lg" type="submit" id="login-btn">Sign In</button>
          </form>
          <p class="text-muted text-sm mt-16">Default: admin / admin123</p>
        </div>
      </div>`;
  },

  bindLogin() {
    const form = Utils.$('#login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = Utils.$('#login-user').value.trim();
      const pass = Utils.$('#login-pass').value;
      const errEl = Utils.$('#login-error');
      const btn = Utils.$('#login-btn');

      if (!user || !pass) {
        errEl.textContent = 'Please enter both fields';
        errEl.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Signing in...';
      const res = await this.login(user, pass);

      if (res.success) {
        App.navigate('home');
      } else {
        errEl.textContent = res.error;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }
};
