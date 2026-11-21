/* AGL Dashboard - penghubung ke Apps Script (menggantikan google.script.run).
   ISI SATU BARIS INI dengan URL web app Apps Script (berakhiran /exec). */
const AGL_API_URL = 'https://script.google.com/macros/s/AKfycbz4TFGZ7e99ft1u361Lv6kQiNiYIvr3lzoK9DkbhuHr0oapZUfWcMRfvYc4ReBqzw_YjA/exec';

(function () {
  var KEY = 'agl-pin', LS = 'agl-pin-ls', loginP = null;
  try { var s = localStorage.getItem(LS); if (s && !sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, s); } catch (e) {}
  function getPin() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function clearPin() { try { sessionStorage.removeItem(KEY); localStorage.removeItem(LS); } catch (e) {} }

  // POST tanpa header khusus -> "simple request", tidak kena preflight CORS Apps Script
  function raw(fn, args, pin) {
    if (AGL_API_URL.indexOf('https://script.google.com/') !== 0) return Promise.reject(new Error('URL API di api.js belum benar. Harus diawali https://script.google.com/ dan berakhiran /exec.'));
    return fetch(AGL_API_URL, { method: 'POST', body: JSON.stringify({ fn: fn, args: args, pin: pin }) })
      .catch(function () { throw new Error('Permintaan diblokir/gagal. Cek deployment Apps Script: akses harus "Anyone" (bukan "Anyone with Google account").'); })
      .then(function (r) { return r.text().then(function (x) {
        try { return JSON.parse(x); }
        catch (e) { throw new Error('Server tidak membalas JSON (HTTP ' + r.status + '). Pastikan Api.gs sudah ditambahkan dan deployment dibuat sebagai Versi baru.'); }
      }); });
  }

  function login(note) {
    if (loginP) return loginP;
    loginP = new Promise(function (done) {
      var o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg,#f4ede2);color:var(--text,#46392f);font-family:system-ui,sans-serif';
      o.innerHTML = '<div style="width:100%;max-width:340px;background:var(--card,#fffcf7);border:1px solid var(--line,#e8dccd);border-radius:16px;padding:22px;box-shadow:var(--sh,0 2px 10px rgba(0,0,0,.1))">'
        + '<h2 style="margin:0 0 4px;font-size:18px">AGL Dashboard</h2>'
        + '<p style="margin:0 0 14px;font-size:14px;color:var(--mu,#7b6d62)">Masukkan kata sandi untuk membuka dashboard.</p>'
        + '<input id="aglpw" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid var(--line2,#d2c1ac);background:var(--field,#f6efe5);color:inherit;font-size:16px">'
        + '<label style="display:flex;flex-direction:row;justify-content:flex-start;align-items:center;gap:8px;width:auto;margin:12px 0;font-size:13px;cursor:pointer"><input id="aglrm" type="checkbox" style="flex:none;width:18px;height:18px;min-width:0;margin:0;padding:0"><span style="flex:0 1 auto;text-align:left">Ingat di perangkat ini</span></label>'
        + '<button id="aglgo" style="width:100%;padding:11px;border:0;border-radius:10px;background:var(--acc,#b8584a);color:#fff;font-size:15px;cursor:pointer">Masuk</button>'
        + '<p id="aglmsg" style="margin:10px 0 0;font-size:13px;color:var(--dn,#bd3f3a);min-height:16px"></p></div>';
      document.body.appendChild(o);
      var pw = o.querySelector('#aglpw'), msg = o.querySelector('#aglmsg'), go = o.querySelector('#aglgo');
      msg.textContent = note || ''; pw.focus();
      function submit() {
        var p = pw.value; if (!p) return;
        go.disabled = true; msg.textContent = '';
        raw('aglUploadMasuk', [p], p).then(function (r) {
          var v = r && r.value;
          if (r && r.ok && v && v.ok) {
            try { sessionStorage.setItem(KEY, p); if (o.querySelector('#aglrm').checked) localStorage.setItem(LS, p); } catch (e) {}
            o.remove(); loginP = null; done();
          } else { msg.textContent = (v && v.pesan) || (r && r.error) || 'Gagal masuk.'; go.disabled = false; }
        }).catch(function (e) { msg.textContent = (e && e.message) || 'Tidak bisa terhubung ke server.'; go.disabled = false; });
      }
      go.onclick = submit; pw.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    });
    return loginP;
  }

  function call(fn, args, retried) {
    if (AGL_API_URL.indexOf('http') !== 0) return Promise.reject(new Error('URL API belum diisi di api.js'));
    var pre = (fn !== 'aglUploadMasuk' && !getPin()) ? login() : Promise.resolve();
    return pre.then(function () {
      return raw(fn, args, fn === 'aglUploadMasuk' ? args[0] : getPin());
    }).then(function (r) {
      if (r && r.kode === 'pin' && !retried) { clearPin(); return login(r.error).then(function () { return call(fn, args, true); }); }
      if (!r || r.ok !== true) throw new Error((r && r.error) || 'Respons server tidak valid');
      return r.value;
    });
  }

  // Meniru google.script.run.withSuccessHandler(..).withFailureHandler(..).namaFungsi(..)
  function mk(ok, fail) {
    return new Proxy({}, { get: function (_, n) {
      if (n === 'withSuccessHandler') return function (f) { return mk(f, fail); };
      if (n === 'withFailureHandler') return function (f) { return mk(ok, f); };
      return function () {
        var a = Array.prototype.slice.call(arguments);
        call(n, a).then(function (v) { if (ok) ok(v); }, function (e) { if (fail) fail(e); else console.error(e); });
      };
    } });
  }
  window.google = { script: { run: mk() } };
})();
