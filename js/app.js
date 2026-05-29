/**
 * Main Application Logic - Buku Kas Revitalisasi
 */

// --- State Management ---
let currentUser = null;
let masterData = { bangunan: [], ruang: [], pos: [] };

// --- UI Utilities ---
const UI = {
    showLoader() { document.getElementById('global-loader').style.display = 'flex'; },
    hideLoader() { document.getElementById('global-loader').style.display = 'none'; },
    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        let bgClass = type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' :
                      type === 'error' ? 'bg-red-50 border-red-500 text-red-900' : 
                      'bg-white border-blue-500 text-slate-800';
        toast.className = `toast flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-l-4 ${bgClass} min-w-[300px] bg-white`;
        toast.innerHTML = `<p class="text-sm font-medium w-full">${message}</p>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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
        
        // Close sidebar on mobile
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
    formatRp(num) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
    },
    formatRpInput(value) {
        let number_string = value.replace(/[^,\d]/g, '').toString(),
            split = number_string.split(','),
            sisa = split[0].length % 3,
            rupiah = split[0].substr(0, sisa),
            ribuan = split[0].substr(sisa).match(/\d{3}/gi);
        if (ribuan) {
            let separator = sisa ? '.' : '';
            rupiah += separator + ribuan.join('.');
        }
        return rupiah ? 'Rp' + rupiah : '';
    },
    toggleJenisTrx() {
        const jenis = document.getElementById('input-jenis').value;
        const posEl = document.getElementById('input-pos');
        if (jenis === 'debet') {
            posEl.value = '';
            posEl.disabled = true; // Pemasukan biasanya tidak punya pos belanja
        } else {
            posEl.disabled = false;
        }
    },
    async promptAddMaster(type) {
        const name = prompt(`Masukkan nama ${type} baru:`);
        if (!name) return;
        
        let payload = { type, nama: name };
        if (type === 'ruang') {
            const bId = prompt('Masukkan ID Bangunan (Lihat di daftar):'); // Simple MVP approach
            if (!bId) return;
            payload.id_bangunan = bId;
        }

        UI.showLoader();
        try {
            const res = await API.post('add_master', payload);
            if (res.status === 'success') {
                UI.toast(res.message, 'success');
                await fetchMasterData(); // refresh data
                renderMasterData();
            } else throw new Error(res.message);
        } catch(e) { UI.toast(e.message, 'error'); }
        UI.hideLoader();
    }
};

// --- API Calls & Data Loaders ---
async function handleLogin(e) {
    e.preventDefault();
    UI.showLoader();
    try {
        const res = await API.post('login', {
            username: document.getElementById('login-username').value,
            password: document.getElementById('login-password').value
        });
        if (res.status === 'success') {
            currentUser = res.data;
            document.getElementById('user-fullname').textContent = currentUser.nama;
            document.getElementById('user-role-badge').textContent = currentUser.role.toUpperCase();
            
            if (currentUser.role === 'kepsek' || currentUser.role === 'admin') {
                document.getElementById('menu-admin').classList.remove('hidden');
            } else {
                document.getElementById('menu-admin').classList.add('hidden');
            }

            await fetchMasterData();
            UI.switchView('view-app');
            UI.switchPage('dashboard');
        } else throw new Error(res.message);
    } catch (e) {
        UI.toast(e.message, 'error');
    }
    UI.hideLoader();
}

async function fetchMasterData() {
    try {
        const res = await API.post('get_master');
        if (res.status === 'success') {
            masterData = res.data;
            populateDropdowns();
        }
    } catch(e) { console.error(e); }
}

function populateDropdowns() {
    const renderOpts = (arr, valKey, textKey) => '<option value="">-- Pilih --</option>' + arr.map(x => `<option value="${x[valKey]}">${x[textKey]}</option>`).join('');
    
    // Filter Buku Kas
    document.getElementById('filter-ruang').innerHTML = renderOpts(masterData.ruang, 'id', 'nama');
    
    // Input Modal
    document.getElementById('input-bangunan').innerHTML = renderOpts(masterData.bangunan, 'id', 'nama');
    document.getElementById('input-ruang').innerHTML = renderOpts(masterData.ruang, 'id', 'nama');
    document.getElementById('input-pos').innerHTML = renderOpts(masterData.pos, 'id', 'nama');
}

async function submitTransaksi() {
    const tgl = document.getElementById('input-tanggal').value;
    const uraian = document.getElementById('input-uraian').value;
    const nominalRaw = document.getElementById('input-nominal').value.replace(/[^,\d]/g, '');
    const bgn = document.getElementById('input-bangunan').value;
    const rng = document.getElementById('input-ruang').value;
    const pos = document.getElementById('input-pos').value;
    const jenis = document.getElementById('input-jenis').value;
    const ket = document.getElementById('input-keterangan').value;

    if (!tgl || !uraian || !nominalRaw || !bgn || !rng) {
        UI.toast('Harap lengkapi semua field bertanda bintang.', 'error');
        return;
    }

    const nominal = parseFloat(nominalRaw);
    const debet = jenis === 'debet' ? nominal : 0;
    const kredit = jenis === 'kredit' ? nominal : 0;

    UI.showLoader();
    try {
        const payload = {
            username: currentUser.username,
            tanggal: tgl,
            uraian: uraian,
            id_bangunan: bgn,
            id_ruang: rng,
            pos_belanja: pos,
            debet: debet,
            kredit: kredit,
            keterangan: ket
        };
        const res = await API.post('submit_transaksi', payload);
        if (res.status === 'success') {
            UI.toast(res.message, 'success');
            document.getElementById('modal-transaksi').classList.add('hidden');
            document.getElementById('form-transaksi').reset();
            document.getElementById('input-nominal').value = '';
            loadBukuKas();
        } else throw new Error(res.message);
    } catch(e) {
        UI.toast(e.message, 'error');
    }
    UI.hideLoader();
}

async function loadBukuKas() {
    UI.showLoader();
    const ruang = document.getElementById('filter-ruang').value;
    try {
        const res = await API.post('get_buku_kas', { id_ruang: ruang });
        const tbody = document.getElementById('table-buku-kas');
        tbody.innerHTML = '';
        if (res.status === 'success' && res.data.length > 0) {
            res.data.forEach(item => {
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="px-4 py-3 whitespace-nowrap text-slate-500">${item.tanggal}</td>
                        <td class="px-4 py-3 font-medium text-slate-800">${item.uraian}<br><span class="text-xs text-slate-400 font-normal">${item.keterangan}</span></td>
                        <td class="px-4 py-3 text-xs text-slate-600">${item.bangunan} / ${item.ruang}</td>
                        <td class="px-4 py-3 text-sm">${item.pos || '-'}</td>
                        <td class="px-4 py-3 text-right text-emerald-600 font-medium">${item.debet > 0 ? UI.formatRp(item.debet) : '-'}</td>
                        <td class="px-4 py-3 text-right text-red-600 font-medium">${item.kredit > 0 ? UI.formatRp(item.kredit) : '-'}</td>
                        <td class="px-4 py-3 text-right text-blue-700 font-bold bg-blue-50/50">${UI.formatRp(item.saldo_akhir)}</td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Tidak ada data transaksi.</td></tr>';
        }
    } catch(e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

async function loadDashboard() {
    UI.showLoader();
    try {
        const res = await API.post('get_dashboard');
        if (res.status === 'success') {
            document.getElementById('dash-pemasukan').textContent = UI.formatRp(res.data.totalPemasukan);
            document.getElementById('dash-pengeluaran').textContent = UI.formatRp(res.data.totalPengeluaran);
            document.getElementById('dash-saldo').textContent = UI.formatRp(res.data.totalSaldo);

            // Bangunan List
            const bgnEl = document.getElementById('dash-bangunan-list');
            bgnEl.innerHTML = res.data.ringkasanBangunan.map(b => `
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="font-medium text-slate-700">${b.nama}</span>
                    <div class="text-right">
                        <div class="text-sm font-bold text-slate-800">${UI.formatRp(b.saldo)}</div>
                        <div class="text-[10px] text-red-500">Kredit: ${UI.formatRp(b.pengeluaran)}</div>
                    </div>
                </div>
            `).join('') || '<p class="text-sm text-slate-400">Belum ada data.</p>';

            // Ruang List
            const rngEl = document.getElementById('dash-ruang-list');
            rngEl.innerHTML = res.data.ringkasanRuang.map(r => `
                <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span class="text-sm text-slate-700">${r.nama}</span>
                    <span class="text-sm font-bold text-blue-600">${UI.formatRp(r.saldo)}</span>
                </div>
            `).join('') || '<p class="text-sm text-slate-400">Belum ada data.</p>';
        }
    } catch(e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

function renderMasterData() {
    const renderLi = (item, type) => `
        <li class="p-3 flex justify-between items-center hover:bg-slate-50">
            <div>
                <p class="font-medium text-slate-700 text-sm">${item.nama}</p>
                <p class="text-[10px] text-slate-400 font-mono">${item.id}</p>
            </div>
            <button onclick="UI.toast('Fitur hapus dinonaktifkan untuk demonstrasi.', 'info')" class="text-red-400 hover:text-red-600"><i class="ph ph-trash"></i></button>
        </li>
    `;
    document.getElementById('list-master-pos').innerHTML = masterData.pos.map(x => renderLi(x, 'pos')).join('');
    document.getElementById('list-master-bangunan').innerHTML = masterData.bangunan.map(x => renderLi(x, 'bangunan')).join('');
    document.getElementById('list-master-ruang').innerHTML = masterData.ruang.map(x => renderLi(x, 'ruang')).join('');
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            UI.switchPage(e.currentTarget.dataset.page);
        });
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        currentUser = null;
        document.getElementById('login-form').reset();
        UI.switchView('view-login');
    });

    const nominalInput = document.getElementById('input-nominal');
    if(nominalInput) {
        nominalInput.addEventListener('keyup', function(e) {
            this.value = UI.formatRpInput(this.value);
        });
    }

    // Tanggal otomatis hari ini
    const dateInput = document.getElementById('input-tanggal');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }

    // Mobile Menu Toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('nav-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    function toggleSidebar() {
        if (sidebar && sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.remove('-translate-x-full');
            if (backdrop) backdrop.classList.remove('hidden');
        } else if (sidebar) {
            sidebar.classList.add('-translate-x-full');
            if (backdrop) backdrop.classList.add('hidden');
        }
    }

    if (mobileBtn) mobileBtn.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', toggleSidebar);
});
