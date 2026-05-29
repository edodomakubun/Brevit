/**
 * Main Application Logic - Phase 3
 */

let currentUser = null;
let masterData = { bangunan: [], ruang: [], pos: [] };
let currentBukuKasData = []; // Raw data cache

const UI = {
    showLoader(text = 'Memproses Data...') { 
        document.getElementById('loader-text').textContent = text;
        document.getElementById('global-loader').style.display = 'flex'; 
    },
    hideLoader() { document.getElementById('global-loader').style.display = 'none'; },
    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        let bgClass = type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' :
                      type === 'error' ? 'bg-red-50 border-red-500 text-red-900' : 
                      'bg-white border-blue-500 text-slate-800';
        toast.className = `toast flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-l-4 ${bgClass} min-w-[300px]`;
        toast.innerHTML = `<p class="text-sm font-medium w-full">${message}</p>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    },
    switchView(viewId) {
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('view-app').classList.add('hidden');
        document.getElementById(viewId).classList.remove('hidden');
    },
    switchPage(pageId) {
        document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`page-${pageId}`).classList.remove('hidden');
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
        if(activeLink) activeLink.classList.add('active');
        
        const sidebar = document.getElementById('nav-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (sidebar && window.innerWidth < 768 && !sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.add('-translate-x-full');
            backdrop.classList.add('hidden');
        }
        
        if (pageId === 'dashboard') loadDashboard();
        if (pageId === 'buku-kas') loadBukuKas();
        if (pageId === 'master-data') renderMasterData();
    },
    formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0); },
    formatRpInput(val) {
        let n = val.replace(/[^,\d]/g, '').toString(), s = n.split(','), m = s[0].length % 3, r = s[0].substr(0, m), t = s[0].substr(m).match(/\d{3}/gi);
        if (t) r += (m ? '.' : '') + t.join('.');
        return r ? 'Rp' + r : '';
    },
    toggleJenisTrx() {
        const jenis = document.getElementById('input-jenis').value;
        const posEl = document.getElementById('input-pos');
        posEl.disabled = (jenis === 'debet');
        if (jenis === 'debet') posEl.value = '';
    },
    async promptAddMaster(type) {
        const name = prompt(`Masukkan nama ${type} baru:`);
        if (!name) return;
        let payload = { type, nama: name, username: currentUser.username };
        if (type === 'ruang') {
            const bId = prompt('Masukkan ID Bangunan:'); // Simplified MVP
            if (!bId) return; payload.id_bangunan = bId;
        }
        UI.showLoader();
        try {
            const res = await API.post('add_master', payload);
            if (res.status === 'success') { UI.toast(res.message, 'success'); await fetchMasterData(); renderMasterData(); }
            else throw new Error(res.message);
        } catch(e) { UI.toast(e.message, 'error'); }
        UI.hideLoader();
    },
    async promptEditMaster(type, id, oldName) {
        const name = prompt(`Ubah nama ${type}:`, oldName);
        if (!name || name === oldName) return;
        UI.showLoader();
        try {
            const res = await API.post('edit_master', { type, id, nama: name, username: currentUser.username });
            if (res.status === 'success') { UI.toast(res.message, 'success'); await fetchMasterData(); renderMasterData(); }
            else throw new Error(res.message);
        } catch(e) { UI.toast(e.message, 'error'); }
        UI.hideLoader();
    },
    async deleteMaster(type, id) {
        if (!confirm('Yakin ingin menghapus data ini?')) return;
        UI.showLoader();
        try {
            const res = await API.post('delete_master', { type, id, username: currentUser.username });
            if (res.status === 'success') { UI.toast(res.message, 'success'); await fetchMasterData(); renderMasterData(); }
            else throw new Error(res.message);
        } catch(e) { UI.toast(e.message, 'error'); }
        UI.hideLoader();
    }
};

// --- API Calls ---
async function handleLogin(e) {
    e.preventDefault();
    UI.showLoader();
    try {
        const res = await API.post('login', { username: document.getElementById('login-username').value, password: document.getElementById('login-password').value });
        if (res.status === 'success') {
            currentUser = res.data;
            document.getElementById('user-fullname').textContent = currentUser.nama;
            document.getElementById('user-role-badge').textContent = currentUser.role.toUpperCase();
            document.getElementById('menu-admin').style.display = (currentUser.role === 'kepsek' || currentUser.role === 'admin') ? 'block' : 'none';
            await fetchMasterData();
            UI.switchView('view-app');
            UI.switchPage('dashboard');
        } else throw new Error(res.message);
    } catch (e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

async function fetchMasterData() {
    try {
        const res = await API.post('get_master');
        if (res.status === 'success') { masterData = res.data; populateDropdowns(); }
    } catch(e) { console.error(e); }
}

function populateDropdowns() {
    const renderOpts = (arr, valKey, textKey) => '<option value="">-- Semua Ruang --</option>' + arr.map(x => `<option value="${x[valKey]}">${x[textKey]}</option>`).join('');
    document.getElementById('filter-ruang').innerHTML = renderOpts(masterData.ruang, 'id', 'nama');
    document.getElementById('export-ruang').innerHTML = '<option value="all">-- Semua Ruang --</option>' + masterData.ruang.map(x => `<option value="${x.id}">${x.nama}</option>`).join('');
    
    const renderModalOpts = (arr) => '<option value="">-- Pilih --</option>' + arr.map(x => `<option value="${x.id}">${x.nama}</option>`).join('');
    document.getElementById('input-bangunan').innerHTML = renderModalOpts(masterData.bangunan);
    document.getElementById('input-ruang').innerHTML = renderModalOpts(masterData.ruang);
    document.getElementById('input-pos').innerHTML = renderModalOpts(masterData.pos);
}

async function submitTransaksi() {
    const raw = document.getElementById('input-nominal').value.replace(/[^,\d]/g, '');
    const p = {
        username: currentUser.username,
        tanggal: document.getElementById('input-tanggal').value,
        uraian: document.getElementById('input-uraian').value,
        id_bangunan: document.getElementById('input-bangunan').value,
        id_ruang: document.getElementById('input-ruang').value,
        pos_belanja: document.getElementById('input-pos').value,
        debet: document.getElementById('input-jenis').value === 'debet' ? parseFloat(raw) : 0,
        kredit: document.getElementById('input-jenis').value === 'kredit' ? parseFloat(raw) : 0,
        keterangan: document.getElementById('input-keterangan').value
    };
    if (!p.tanggal || !p.uraian || !raw || !p.id_bangunan || !p.id_ruang) return UI.toast('Lengkapi form.', 'error');
    if (document.getElementById('input-jenis').value === 'kredit' && !p.pos_belanja) return UI.toast('Harap pilih Pos Belanja untuk Pengeluaran (Kredit).', 'error');

    UI.showLoader();
    try {
        const res = await API.post('submit_transaksi', p);
        if (res.status === 'success') {
            UI.toast(res.message, 'success');
            document.getElementById('modal-transaksi').classList.add('hidden');
            document.getElementById('form-transaksi').reset();
            document.getElementById('input-nominal').value = '';
            loadBukuKas();
        } else throw new Error(res.message);
    } catch(e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

async function loadBukuKas() {
    UI.showLoader();
    try {
        const res = await API.post('get_buku_kas', {});
        if (res.status === 'success') {
            currentBukuKasData = res.data;
            applyFilters();
        }
    } catch(e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

function applyFilters() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const ruang = document.getElementById('filter-ruang').value;
    const tglAwal = document.getElementById('filter-tgl-awal').value;
    const tglAkhir = document.getElementById('filter-tgl-akhir').value;

    let filtered = currentBukuKasData.filter(item => {
        let pass = true;
        
        if (search) {
            const u = (item.uraian || '').toLowerCase();
            const k = (item.keterangan || '').toLowerCase();
            if (!u.includes(search) && !k.includes(search)) pass = false;
        }
        
        if (ruang && item.id_ruang !== ruang) pass = false;
        if (tglAwal && item.tanggal < tglAwal) pass = false;
        if (tglAkhir && item.tanggal > tglAkhir) pass = false;
        return pass;
    });

    const tbody = document.getElementById('table-buku-kas');
    tbody.innerHTML = '';
    if (filtered.length > 0) {
        filtered.forEach(item => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 border-b border-slate-50">
                    <td class="px-4 py-3 whitespace-nowrap text-slate-500">${item.tanggal}</td>
                    <td class="px-4 py-3 font-medium text-slate-800">${item.uraian}<br><span class="text-xs text-slate-400 font-normal">${item.keterangan}</span></td>
                    <td class="px-4 py-3 text-xs text-slate-600">${item.bangunan} / ${item.ruang}</td>
                    <td class="px-4 py-3 text-sm">${item.pos || '-'}</td>
                    <td class="px-4 py-3 text-right text-emerald-600 font-medium">${item.debet > 0 ? UI.formatRp(item.debet) : '-'}</td>
                    <td class="px-4 py-3 text-right text-red-600 font-medium">${item.kredit > 0 ? UI.formatRp(item.kredit) : '-'}</td>
                    <td class="px-4 py-3 text-right text-blue-700 font-bold">${UI.formatRp(item.saldo_akhir)}</td>
                </tr>
            `;
        });
    } else tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>';
}

async function loadDashboard() {
    UI.showLoader();
    try {
        const res = await API.post('get_dashboard');
        if (res.status === 'success') {
            document.getElementById('dash-pemasukan').textContent = UI.formatRp(res.data.totalPemasukan);
            document.getElementById('dash-pengeluaran').textContent = UI.formatRp(res.data.totalPengeluaran);
            document.getElementById('dash-saldo').textContent = UI.formatRp(res.data.totalSaldo);

            document.getElementById('dash-bangunan-list').innerHTML = res.data.ringkasanBangunan.map(b => `
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="font-medium text-slate-700">${b.nama}</span>
                    <div class="text-right">
                        <div class="text-sm font-bold text-slate-800">${UI.formatRp(b.saldo)}</div>
                        <div class="text-[10px] text-red-500">Kredit: ${UI.formatRp(b.pengeluaran)}</div>
                    </div>
                </div>
            `).join('') || '<p class="text-sm text-slate-400">Belum ada data.</p>';

            document.getElementById('dash-ruang-list').innerHTML = res.data.ringkasanRuang.map(r => `
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-sm text-slate-700">${r.nama}</span><span class="text-sm font-bold text-blue-600">${UI.formatRp(r.saldo)}</span>
                </div>
            `).join('') || '<p class="text-sm">Kosong</p>';
        }
    } catch(e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

function renderMasterData() {
    const renderLi = (item, type) => `
        <li class="p-3 flex justify-between items-center hover:bg-slate-50 border-b border-slate-50">
            <div><p class="font-medium text-sm">${item.nama}</p><p class="text-[10px] text-slate-400 font-mono">${item.id}</p></div>
            <div class="flex gap-2">
                <button onclick="UI.promptEditMaster('${type}', '${item.id}', '${item.nama}')" class="text-blue-500 hover:text-blue-700"><i class="ph ph-pencil-simple"></i></button>
                <button onclick="UI.deleteMaster('${type}', '${item.id}')" class="text-red-400 hover:text-red-600"><i class="ph ph-trash"></i></button>
            </div>
        </li>
    `;
    document.getElementById('list-master-pos').innerHTML = masterData.pos.map(x => renderLi(x, 'pos')).join('');
    document.getElementById('list-master-bangunan').innerHTML = masterData.bangunan.map(x => renderLi(x, 'bangunan')).join('');
    document.getElementById('list-master-ruang').innerHTML = masterData.ruang.map(x => renderLi(x, 'ruang')).join('');
}

async function handleExport(format) {
    const ruang = document.getElementById('export-ruang').value;
    document.getElementById('modal-export').classList.add('hidden');
    UI.showLoader(`Menyiapkan file ${format.toUpperCase()}...`);
    try {
        const res = await API.post('export_laporan', { id_ruang: ruang, format: format, username: currentUser.username });
        if (res.status === 'success') {
            const { fileData, mimeType, filename } = res.data;
            const byteCharacters = atob(fileData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            UI.toast('Berhasil mengunduh laporan.', 'success');
        } else throw new Error(res.message);
    } catch(e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.querySelectorAll('.nav-link').forEach(link => { link.addEventListener('click', (e) => { e.preventDefault(); UI.switchPage(e.currentTarget.dataset.page); }); });
    document.getElementById('btn-logout').addEventListener('click', () => { currentUser = null; document.getElementById('login-form').reset(); UI.switchView('view-login'); });
    const nmInput = document.getElementById('input-nominal');
    if(nmInput) nmInput.addEventListener('keyup', function() { this.value = UI.formatRpInput(this.value); });
    const dtInput = document.getElementById('input-tanggal');
    if (dtInput) dtInput.valueAsDate = new Date();
    ['filter-search','filter-ruang','filter-tgl-awal','filter-tgl-akhir'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyFilters);
    });
    
    // Mobile Menu Toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('nav-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    function toggleSidebar() {
        if (sidebar && sidebar.classList.contains('-translate-x-full')) { sidebar.classList.remove('-translate-x-full'); if (backdrop) backdrop.classList.remove('hidden'); } 
        else if (sidebar) { sidebar.classList.add('-translate-x-full'); if (backdrop) backdrop.classList.add('hidden'); }
    }
    if (mobileBtn) mobileBtn.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', toggleSidebar);
});
