/**
 * Main Application Logic - Phase 4 (IndexedDB + Seamless UI)
 */

let currentUser = null;
let masterData = { bangunan: [], ruang: [], pos: [] };
let currentBukuKasData = []; // Cache lokal dari IndexedDB

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

        // Trigger load functions based on page
        if (pageId === 'master-data') {
            loadMasterData();
        } else if (pageId === 'alokasi-dana') {
            loadAlokasiDana();
        } else if (pageId === 'aturan') {
            loadAturan();
        }

        // Terapkan Aturan Visibilitas Tombol Ekspor di Buku Kas
        if (pageId === 'buku-kas' || pageId === 'dashboard') {
            const btnExport = document.getElementById('btn-export-laporan');
            if (btnExport) {
                if (currentUser && currentUser.role === 'bendahara' && masterData.pengaturan?.hide_export === true) {
                    btnExport.style.display = 'none';
                } else {
                    btnExport.style.display = 'flex'; // kembalikan ke flex (tailwind class 'flex')
                }
            }
        }
    },
    formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0); },
    formatRpInput(val) {
        let n = val.replace(/[^,\d]/g, '').toString(), s = n.split(','), m = s[0].length % 3, r = s[0].substr(0, m), t = s[0].substr(m).match(/\d{3}/gi);
        if (t) r += (m ? '.' : '') + t.join('.');
        return r ? 'Rp' + r : '';
    },
    formatDateID(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString);
        if(isNaN(d.getTime())) return dateString;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
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
            const bId = prompt('Masukkan ID Bangunan:');
            if (!bId) return; payload.id_bangunan = bId;
        }
        try {
            const res = await API.post('add_master', payload);
            if (res.status === 'success') { UI.toast(res.message, 'success'); syncAllData(true); }
            else throw new Error(res.message);
        } catch(e) { UI.toast(e.message, 'error'); }
    },
    async promptEditMaster(type, id, oldName) {
        const name = prompt(`Ubah nama ${type}:`, oldName);
        if (!name || name === oldName) return;
        try {
            const res = await API.post('edit_master', { type, id, nama: name, username: currentUser.username });
            if (res.status === 'success') { UI.toast(res.message, 'success'); syncAllData(true); }
            else throw new Error(res.message);
        } catch(e) { UI.toast(e.message, 'error'); }
    },
    async deleteMaster(type, id) {
        if (!confirm('Yakin ingin menghapus data ini?')) return;
        try {
            const res = await API.post('delete_master', { type, id, username: currentUser.username });
            if (res.status === 'success') { UI.toast(res.message, 'success'); syncAllData(true); }
            else throw new Error(res.message);
        } catch(e) { UI.toast(e.message, 'error'); }
    },
    logout() {
        currentUser = null;
        localforage.clear();
        document.getElementById('login-form').reset();
        UI.switchView('view-login');
    }
};

// --- Core Data Sync (IndexedDB) ---
async function syncAllData(isBackground = false) {
    if (isBackground) {
        document.getElementById('sync-indicator').classList.remove('hidden');
        document.getElementById('sync-indicator').classList.add('flex');
    }
    
    try {
        const res = await API.post('sync_all');
        if (res.status === 'success') {
            masterData = res.data.master;
            currentBukuKasData = res.data.buku_kas;
            
            // Simpan ke IndexedDB
            await localforage.setItem('masterData', masterData);
            await localforage.setItem('bukuKasData', currentBukuKasData);
            
            // Re-render UI secara sinkron (Seamless)
            populateDropdowns();
            applyFilters();
            loadDashboard();
            renderMasterData();
            loadAlokasiDana();
        } else {
            throw new Error(res.message);
        }
    } catch(e) {
        console.error("Sync Error:", e);
        if (!isBackground) throw e; 
    } finally {
        if (isBackground) {
            document.getElementById('sync-indicator').classList.add('hidden');
            document.getElementById('sync-indicator').classList.remove('flex');
        }
    }
}

// --- API Calls & Handlers ---
async function handleLogin(e) {
    e.preventDefault();
    UI.showLoader('Mengesahkan pengguna...');
    try {
        const res = await API.post('login', { username: document.getElementById('login-username').value, password: document.getElementById('login-password').value });
        if (res.status === 'success') {
            currentUser = res.data;
            await localforage.setItem('currentUser', currentUser);
            
            document.getElementById('user-fullname').textContent = currentUser.nama;
            document.getElementById('menu-admin').style.display = (currentUser.role === 'kepsek' || currentUser.role === 'admin') ? 'block' : 'none';
            
            // Ambil semua data pada saat pertama kali login
            UI.showLoader('Mengunduh data awal...');
            await syncAllData(false);
            
            UI.switchView('view-app');
            UI.switchPage('dashboard');
        } else throw new Error(res.message);
    } catch (e) { UI.toast(e.message, 'error'); }
    UI.hideLoader();
}

async function checkSession() {
    const user = await localforage.getItem('currentUser');
    if (user) {
        currentUser = user;
        document.getElementById('user-fullname').textContent = currentUser.nama;
        document.getElementById('menu-admin').style.display = (currentUser.role === 'kepsek' || currentUser.role === 'admin') ? 'block' : 'none';
        
        // Coba muat dari cache lokal dulu agar instan
        const cachedMaster = await localforage.getItem('masterData');
        const cachedBukuKas = await localforage.getItem('bukuKasData');
        if (cachedMaster && cachedBukuKas) {
            masterData = cachedMaster;
            currentBukuKasData = cachedBukuKas;
            populateDropdowns();
            applyFilters();
            loadDashboard();
            renderMasterData();
            
            UI.switchView('view-app');
            UI.switchPage('dashboard');
            
            // Sync di latar belakang
            syncAllData(true);
        }
    }
}

function populateDropdowns() {
    const renderOpts = (arr, valKey, textKey) => '<option value="">-- Semua Ruang --</option>' + arr.map(x => `<option value="${x[valKey]}">${x[textKey]}</option>`).join('');
    document.getElementById('filter-ruang').innerHTML = renderOpts(masterData.ruang, 'id', 'nama');
    
    if(document.getElementById('export-bangunan')) {
        document.getElementById('export-bangunan').innerHTML = '<option value="all">-- Semua Bangunan --</option>' + masterData.bangunan.map(x => `<option value="${x.id}">${x.nama}</option>`).join('');
    }
    
    const renderModalOpts = (arr) => '<option value="">-- Pilih --</option>' + arr.map(x => `<option value="${x.id}">${x.nama}</option>`).join('');
    document.getElementById('input-bangunan').innerHTML = renderModalOpts(masterData.bangunan);
    document.getElementById('input-ruang').innerHTML = '<option value="">-- Pilih Bangunan Dulu --</option>'; // Dinamis
    document.getElementById('input-pos').innerHTML = renderModalOpts(masterData.pos);
    
    // Alokasi Dana Dropdowns
    const alokasiBangunan = document.getElementById('alokasi-bangunan');
    if (alokasiBangunan) alokasiBangunan.innerHTML = renderModalOpts(masterData.bangunan);
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

    document.getElementById('modal-transaksi').classList.add('hidden');
    document.getElementById('form-transaksi').reset();
    document.getElementById('input-nominal').value = '';
    
    UI.toast('Menyimpan transaksi...', 'info');
    
    // Background POST
    try {
        const res = await API.post('submit_transaksi', p);
        if (res.status === 'success') {
            UI.toast('Transaksi berhasil disimpan.', 'success');
            syncAllData(true); // Re-fetch all to ensure integrity
        } else throw new Error(res.message);
    } catch(e) { UI.toast('Gagal: ' + e.message, 'error'); }
}

function applyFilters() {
    const search = document.getElementById('filter-search')?.value.toLowerCase();
    const ruang = document.getElementById('filter-ruang')?.value;
    const tglAwal = document.getElementById('filter-tgl-awal')?.value;
    const tglAkhir = document.getElementById('filter-tgl-akhir')?.value;

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

    const container = document.getElementById('buku-kas-container');
    if(!container) return;
    
    container.innerHTML = '';
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-slate-400 bg-white rounded-xl shadow-sm border border-slate-200">Data tidak ditemukan.</div>';
        return;
    }

    // Group by bangunan
    const grouped = {};
    filtered.forEach(item => {
        const b = item.bangunan || 'Tidak Diketahui';
        if (!grouped[b]) grouped[b] = [];
        grouped[b].push(item);
    });

    // Urutkan bangunan secara abjad
    const sortedBangunan = Object.keys(grouped).sort();

    let html = '';
    sortedBangunan.forEach(b => {
        const dataBangunan = grouped[b];
        
        // Urutkan data berdasarkan ruang lalu tanggal
        dataBangunan.sort((a, b) => {
            if (a.ruang !== b.ruang) return a.ruang.localeCompare(b.ruang);
            return new Date(a.tanggal) - new Date(b.tanggal);
        });

        html += `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div class="px-5 py-3 bg-blue-900 border-b border-blue-800 flex justify-between items-center">
                <h3 class="font-bold text-white text-lg">Buku Kas - ${b}</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                            <th class="px-4 py-3">Tanggal</th>
                            <th class="px-4 py-3">Uraian</th>
                            <th class="px-4 py-3">Keterangan</th>
                            <th class="px-4 py-3">Ruang</th>
                            <th class="px-4 py-3">Pos Belanja</th>
                            <th class="px-4 py-3 text-right">Pemasukan</th>
                            <th class="px-4 py-3 text-right">Pengeluaran</th>
                            <th class="px-4 py-3 text-right">Saldo Akhir</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
        `;

        let currentRuang = '';
        dataBangunan.forEach(item => {
            // Optional: Header sekunder per ruang jika dirasa perlu (saat ini sudah dipisah rapi)
            if (currentRuang !== item.ruang) {
                currentRuang = item.ruang;
                html += `
                <tr class="bg-slate-50 border-y border-slate-200">
                    <td colspan="8" class="px-4 py-2 font-bold text-blue-800">
                        <i class="ph ph-folder-open mr-2"></i> Ruang: ${currentRuang}
                    </td>
                </tr>
                `;
            }

            let displayDebet = (item.debet > 0) ? UI.formatRp(item.debet) : '-';
            let displaySaldoAkhir = UI.formatRp(item.saldo_akhir);
            const hiddenHtml = `<span class="inline-flex items-center gap-1 justify-end">Rp *** <button onclick="UI.toast('Akses Terkunci', 'error')" class="text-slate-400 hover:text-red-500 focus:outline-none transition-colors" title="Data Terkunci"><i class="ph ph-eye-slash"></i></button></span>`;
            
            // Aturan Visibilitas Bendahara
            if (currentUser && currentUser.role === 'bendahara' && masterData.pengaturan) {
                if (masterData.pengaturan.hide_debet_alokasi === true && item.uraian === 'Alokasi Dana') {
                    displayDebet = hiddenHtml;
                }
                if (masterData.pengaturan.hide_saldo_akhir === true) {
                    displaySaldoAkhir = hiddenHtml;
                }
            }

            html += `
                <tr class="hover:bg-blue-50 transition-colors">
                    <td class="px-4 py-3 whitespace-nowrap text-slate-500">${UI.formatDateID(item.tanggal)}</td>
                    <td class="px-4 py-3 font-medium text-slate-800">${item.uraian}</td>
                    <td class="px-4 py-3 text-xs text-slate-500">${item.keterangan || '-'}</td>
                    <td class="px-4 py-3 text-xs text-slate-600 font-medium">${item.ruang}</td>
                    <td class="px-4 py-3 text-sm">${item.pos || '-'}</td>
                    <td class="px-4 py-3 text-right text-emerald-600 font-medium">${displayDebet}</td>
                    <td class="px-4 py-3 text-right text-red-600 font-medium">${item.kredit > 0 ? UI.formatRp(item.kredit) : '-'}</td>
                    <td class="px-4 py-3 text-right text-blue-700 font-bold">${displaySaldoAkhir}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

function loadDashboard() {
    let totalDebet = 0, totalKredit = 0;
    let rekapRuang = {}; 
    
    currentBukuKasData.forEach(item => {
        const dbt = parseFloat(item.debet) || 0;
        const krd = parseFloat(item.kredit) || 0;
        const sAk = parseFloat(item.saldo_akhir) || 0;
        const rId = item.id_ruang;
        const bId = item.id_bangunan;
        
        totalDebet += dbt;
        totalKredit += krd;
        
        if (!rekapRuang[rId]) rekapRuang[rId] = { bId: bId, debet: 0, kredit: 0, saldo_akhir: 0 };
        rekapRuang[rId].debet += dbt;
        rekapRuang[rId].kredit += krd;
        rekapRuang[rId].saldo_akhir = sAk; 
    });

    const bgnMap = {}; 
    masterData.bangunan.forEach(b => bgnMap[b.id] = { nama: b.nama, total_saldo: 0, total_pengeluaran: 0 });
    const rngMap = {}; 
    masterData.ruang.forEach(r => rngMap[r.id] = r.nama);

    for (let rId in rekapRuang) {
        const bId = rekapRuang[rId].bId;
        if (bgnMap[bId]) {
            bgnMap[bId].total_saldo += rekapRuang[rId].saldo_akhir;
            bgnMap[bId].total_pengeluaran += rekapRuang[rId].kredit;
        }
    }

    const ringkasanRuang = Object.keys(rekapRuang).map(rId => ({ nama: rngMap[rId] || rId, saldo: rekapRuang[rId].saldo_akhir }));
    const ringkasanBangunan = Object.keys(bgnMap).map(bId => ({ nama: bgnMap[bId].nama, pengeluaran: bgnMap[bId].total_pengeluaran, saldo: bgnMap[bId].total_saldo }));

    if(document.getElementById('dash-pemasukan')){
        const isBendahara = currentUser && currentUser.role === 'bendahara';
        const p = masterData.pengaturan || {};
        
        const hidePemPeng = isBendahara && String(p.hide_pemasukan_pengeluaran) === 'true';
        const hideSaldo = isBendahara && String(p.hide_saldo_dashboard) === 'true';
        const hideSaldoBgn = isBendahara && String(p.hide_saldo_bangunan) === 'true';
        const hideRincianBgn = isBendahara && String(p.hide_rincian_bangunan) === 'true';

        const hiddenHtml = `<span class="inline-flex items-center gap-1 justify-end">Rp *** <button onclick="UI.toast('Akses Terkunci', 'error')" class="text-slate-400 hover:text-red-500 focus:outline-none transition-colors" title="Data Terkunci"><i class="ph ph-eye-slash"></i></button></span>`;

        document.getElementById('dash-pemasukan').innerHTML = hidePemPeng ? hiddenHtml : UI.formatRp(totalDebet);
        document.getElementById('dash-pengeluaran').innerHTML = hidePemPeng ? hiddenHtml : UI.formatRp(totalKredit);
        document.getElementById('dash-saldo').innerHTML = hideSaldo ? hiddenHtml : UI.formatRp(totalDebet - totalKredit);
        
        document.getElementById('dash-bangunan-list').innerHTML = ringkasanBangunan.map(b => `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="font-medium text-slate-700">${b.nama}</span>
                <div class="text-right">
                    <div class="text-sm font-bold text-slate-800">${hideSaldoBgn ? hiddenHtml : UI.formatRp(b.saldo)}</div>
                    <div class="text-[10px] text-red-500">Kredit: ${UI.formatRp(b.pengeluaran)}</div>
                </div>
            </div>
        `).join('') || '<p class="text-sm text-slate-400">Belum ada data.</p>';
        
        document.getElementById('dash-ruang-list').innerHTML = ringkasanRuang.map(r => `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="text-sm text-slate-700">${r.nama}</span><span class="text-sm font-bold text-blue-600">${hideSaldoBgn ? hiddenHtml : UI.formatRp(r.saldo)}</span>
            </div>
        `).join('') || '<p class="text-sm text-slate-400">Kosong</p>';
        
        // HIERARKI RENDERER (Bangunan -> Ruang)
        const hierarkiList = document.getElementById('dash-hierarki-list');
        let hierarkiHTML = '';
        
        // Sort Bangunan Name
        const sortedBangunanKeys = Object.keys(bgnMap).sort((a,b) => bgnMap[a].nama.localeCompare(bgnMap[b].nama));
        
        sortedBangunanKeys.forEach(bId => {
            const b = bgnMap[bId];
            hierarkiHTML += `
                <div class="mb-4 border border-slate-200 rounded-lg overflow-hidden">
                    <div class="bg-blue-50 px-4 py-3 flex justify-between items-center font-bold text-blue-900 border-b border-blue-100">
                        <div class="flex items-center gap-2"><i class="ph ph-buildings"></i> ${b.nama}</div>
                        <div>${hideRincianBgn ? hiddenHtml : UI.formatRp(b.total_saldo)}</div>
                    </div>
                    <div class="divide-y divide-slate-100 bg-white">
            `;
            
            // Find rooms for this building
            const roomsForThisBuilding = masterData.ruang.filter(r => r.id_bangunan === bId);
            if(roomsForThisBuilding.length > 0) {
                roomsForThisBuilding.forEach(r => {
                    const rInfo = rekapRuang[r.id];
                    const saldoRng = rInfo ? rInfo.saldo_akhir : 0;
                    hierarkiHTML += `
                        <div class="px-4 py-2 flex justify-between items-center text-sm hover:bg-slate-50">
                            <div class="flex items-center gap-2 text-slate-600 pl-4"><i class="ph ph-door"></i> ${r.nama}</div>
                            <div class="font-medium text-slate-800">${hideRincianBgn ? hiddenHtml : UI.formatRp(saldoRng)}</div>
                        </div>
                    `;
                });
            } else {
                hierarkiHTML += `<div class="px-4 py-2 text-sm text-slate-400 italic pl-4">Belum ada data ruang</div>`;
            }
            hierarkiHTML += `</div></div>`;
        });
        
        hierarkiList.innerHTML = hierarkiHTML || '<p class="text-sm text-slate-400">Belum ada data hierarki.</p>';
    }
}

function loadAlokasiDana() {
    const tbody = document.getElementById('table-alokasi-dana');
    if (!tbody) return;

    if (!masterData.ruang || masterData.ruang.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-4 text-center text-slate-400">Data Master Ruang belum tersedia.</td></tr>';
        return;
    }

    const totals = {};
    masterData.ruang.forEach(r => {
        totals[r.id] = { debet: 0, kredit: 0 };
    });

    currentBukuKasData.forEach(trx => {
        if (totals[trx.id_ruang]) {
            totals[trx.id_ruang].debet += parseFloat(trx.debet) || 0;
            totals[trx.id_ruang].kredit += parseFloat(trx.kredit) || 0;
        }
    });

    const bgnMap = {};
    masterData.bangunan.forEach(b => bgnMap[b.id] = b.nama);

    let html = '';
    // Kelompokkan per bangunan untuk tampilan rapi
    const grouped = {};
    masterData.ruang.forEach(r => {
        const bNama = bgnMap[r.id_bangunan] || 'Tidak Diketahui';
        if (!grouped[bNama]) grouped[bNama] = [];
        grouped[bNama].push(r);
    });

    Object.keys(grouped).sort().forEach(bNama => {
        grouped[bNama].forEach(r => {
            const debet = totals[r.id].debet;
            const kredit = totals[r.id].kredit;
            const saldo = debet - kredit;

            html += `
                <tr class="hover:bg-slate-50">
                    <td class="px-5 py-3 text-slate-600">${bNama}</td>
                    <td class="px-5 py-3 font-medium text-slate-800">${r.nama}</td>
                    <td class="px-5 py-3 text-right text-emerald-600 font-medium">${UI.formatRp(debet)}</td>
                    <td class="px-5 py-3 text-right text-red-600 font-medium">${UI.formatRp(kredit)}</td>
                    <td class="px-5 py-3 text-right text-blue-700 font-bold">${UI.formatRp(saldo)}</td>
                </tr>
            `;
        });
    });

    tbody.innerHTML = html;
}

// --- Pengaturan / Aturan ---
function loadAturan() {
    const p = masterData.pengaturan || {};
    document.getElementById('setting-hide-debet-alokasi').checked = p.hide_debet_alokasi === true || String(p.hide_debet_alokasi) === 'true';
    document.getElementById('setting-hide-saldo-akhir').checked = p.hide_saldo_akhir === true || String(p.hide_saldo_akhir) === 'true';
    document.getElementById('setting-hide-export').checked = p.hide_export === true || String(p.hide_export) === 'true';
    document.getElementById('setting-hide-pemasukan-pengeluaran').checked = p.hide_pemasukan_pengeluaran === true || String(p.hide_pemasukan_pengeluaran) === 'true';
    document.getElementById('setting-hide-saldo-dashboard').checked = p.hide_saldo_dashboard === true || String(p.hide_saldo_dashboard) === 'true';
    document.getElementById('setting-hide-saldo-bangunan').checked = p.hide_saldo_bangunan === true || String(p.hide_saldo_bangunan) === 'true';
    document.getElementById('setting-hide-rincian-bangunan').checked = p.hide_rincian_bangunan === true || String(p.hide_rincian_bangunan) === 'true';
}

async function saveAturan() {
    const p = {
        hide_debet_alokasi: document.getElementById('setting-hide-debet-alokasi').checked,
        hide_saldo_akhir: document.getElementById('setting-hide-saldo-akhir').checked,
        hide_export: document.getElementById('setting-hide-export').checked,
        hide_pemasukan_pengeluaran: document.getElementById('setting-hide-pemasukan-pengeluaran').checked,
        hide_saldo_dashboard: document.getElementById('setting-hide-saldo-dashboard').checked,
        hide_saldo_bangunan: document.getElementById('setting-hide-saldo-bangunan').checked,
        hide_rincian_bangunan: document.getElementById('setting-hide-rincian-bangunan').checked
    };
    
    UI.showLoader('Menyimpan Pengaturan...');
    try {
        const res = await API.post('save_pengaturan', { username: currentUser.username, pengaturan: p });
        if (res.status === 'success') {
            UI.toast(res.message, 'success');
            if(!masterData.pengaturan) masterData.pengaturan = {};
            Object.assign(masterData.pengaturan, p);
            await localforage.setItem('masterData', masterData);
        } else {
            throw new Error(res.message);
        }
    } catch(e) {
        UI.toast('Gagal menyimpan: ' + e.message, 'error');
    }
    UI.hideLoader();
}

async function submitAlokasi(e) {
    const bgn = document.getElementById('alokasi-bangunan').value;
    const rng = document.getElementById('alokasi-ruang').value;
    const nominalRaw = document.getElementById('alokasi-nominal').value.replace(/[^0-9]/g, '');
    
    if (!bgn || !rng || !nominalRaw) {
        UI.toast('Semua kolom wajib diisi!', 'error');
        return;
    }

    const nominal = parseInt(nominalRaw);
    if (nominal <= 0) {
        UI.toast('Nominal harus lebih dari 0', 'error');
        return;
    }

    // Buat format tanggal hari ini YYYY-MM-DD
    const today = new Date();
    const tgl = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    const payload = {
        tanggal: tgl,
        jenis: 'debet',
        uraian: 'Alokasi Dana',
        id_bangunan: bgn,
        id_ruang: rng,
        pos_belanja: '', // Alokasi biasanya tidak ada pos belanja
        debet: nominal,
        kredit: 0,
        keterangan: 'Pencairan/Alokasi Dana',
        username: currentUser.username
    };

    try {
        UI.showLoader('Menyimpan Alokasi...');
        const res = await API.post('submit_transaksi', payload);
        UI.hideLoader();
        if (res.status === 'success') {
            document.getElementById('modal-alokasi').classList.add('hidden');
            document.getElementById('form-alokasi').reset();
            UI.toast('Alokasi Dana berhasil ditambahkan!', 'success');
            syncAllData(); // Reload all
        } else {
            UI.toast('Error: ' + res.message, 'error');
        }
    } catch (error) {
        UI.hideLoader();
        UI.toast('Gagal memproses transaksi: ' + error.message, 'error');
    }
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
    if(document.getElementById('list-master-pos')){
        document.getElementById('list-master-pos').innerHTML = masterData.pos.map(x => renderLi(x, 'pos')).join('');
        document.getElementById('list-master-bangunan').innerHTML = masterData.bangunan.map(x => renderLi(x, 'bangunan')).join('');
        document.getElementById('list-master-ruang').innerHTML = masterData.ruang.map(x => renderLi(x, 'ruang')).join('');
    }
}

async function handleExport(format) {
    const bId = document.getElementById('export-bangunan').value;
    const rId = document.getElementById('export-ruang').value;
    document.getElementById('modal-export').classList.add('hidden');
    UI.showLoader(`Menyiapkan file ${format.toUpperCase()}...`);
    
    try {
        let filtered = currentBukuKasData;
        let titleContext = "Semua Bangunan & Ruang";
        
        if (bId !== 'all') {
            filtered = filtered.filter(d => d.id_bangunan === bId);
            const bInfo = masterData.bangunan.find(b => b.id === bId);
            titleContext = `Bangunan: ${bInfo ? bInfo.nama : bId}`;
            
            if (rId !== 'all') {
                filtered = filtered.filter(d => d.id_ruang === rId);
                const rInfo = masterData.ruang.find(r => r.id === rId);
                titleContext += ` - Ruang: ${rInfo ? rInfo.nama : rId}`;
            } else {
                titleContext += ` - Semua Ruang`;
            }
        }
        
        // Urutkan berdasarkan Bangunan, lalu Ruang, lalu Tanggal
        filtered.sort((a, b) => {
            if (a.bangunan !== b.bangunan) return a.bangunan.localeCompare(b.bangunan);
            if (a.ruang !== b.ruang) return a.ruang.localeCompare(b.ruang);
            return new Date(a.tanggal) - new Date(b.tanggal);
        });

        const headers = [["No", "Tanggal", "Uraian", "Keterangan", "Bangunan/Ruang", "Pos Belanja", "Pemasukan (Debet)", "Pengeluaran (Kredit)", "Saldo Akhir"]];

        if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Buku Kas');

            worksheet.getCell('A1').value = 'LAPORAN BUKU KAS REVITALISASI';
            worksheet.getCell('A1').font = { bold: true, size: 14 };
            worksheet.getCell('A2').value = 'SD INPRES LELINGLUAN';
            worksheet.getCell('A2').font = { bold: true };
            worksheet.getCell('A3').value = `Konteks: ${titleContext}`;
            worksheet.addRow([]);

            const headerRow = worksheet.addRow(headers[0]);
            headerRow.eachCell((cell) => {
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            let currentB = '';
            let currentR = '';
            let nomor = 1;

            filtered.forEach((item) => {
                if (item.bangunan !== currentB || item.ruang !== currentR) {
                    currentB = item.bangunan;
                    currentR = item.ruang;
                    const groupRow = worksheet.addRow([`${currentB} - ${currentR}`, '', '', '', '', '', '', '', '']);
                    worksheet.mergeCells(`A${groupRow.number}:I${groupRow.number}`);
                    groupRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
                    groupRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // bg-blue-900
                    groupRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
                    nomor = 1; 
                }

                const r = [
                    nomor++, UI.formatDateID(item.tanggal), item.uraian, item.keterangan || '-', 
                    `${item.bangunan} / ${item.ruang}`, item.pos || '-', 
                    item.debet || 0, item.kredit || 0, item.saldo_akhir || 0
                ];
                
                const row = worksheet.addRow(r);
                row.eachCell((cell, colNumber) => {
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    if (colNumber >= 7 && colNumber <= 9) cell.numFmt = '"Rp"#,##0';
                });
            });

            worksheet.columns = [
                { width: 6 }, { width: 14 }, { width: 40 }, { width: 35 }, { width: 25 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }
            ];

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Laporan_BukuKas.xlsx`;
            link.click();
        } 
        else if (format === 'pdf') {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'pt', 'a4'); 
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("LAPORAN BUKU KAS REVITALISASI", 40, 40);
            
            doc.setFontSize(12);
            doc.text("SD INPRES LELINGLUAN", 40, 60);
            doc.setFont("helvetica", "normal");
            doc.text(`Konteks: ${titleContext}`, 40, 80);
            
            const formatRpPdf = (val) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(val);
            const bodyData = [];
            
            let currentB = '';
            let currentR = '';
            let nom = 1;

            filtered.forEach(item => {
                if (item.bangunan !== currentB || item.ruang !== currentR) {
                    currentB = item.bangunan;
                    currentR = item.ruang;
                    bodyData.push([{ content: `${currentB} - ${currentR}`, colSpan: 9, styles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' } }]);
                    nom = 1;
                }
                bodyData.push([
                    nom++, UI.formatDateID(item.tanggal), item.uraian, item.keterangan || '-', 
                    `${item.bangunan} / ${item.ruang}`, item.pos || '-', 
                    formatRpPdf(item.debet || 0), formatRpPdf(item.kredit || 0), formatRpPdf(item.saldo_akhir || 0)
                ]);
            });

            doc.autoTable({
                startY: 100,
                head: headers,
                body: bodyData,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [30, 58, 138] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 20 },
                    6: { halign: 'right' },
                    7: { halign: 'right' },
                    8: { halign: 'right' }
                }
            });
            doc.save(`Laporan_BukuKas.pdf`);
        }
        UI.toast('Berhasil mengunduh laporan.', 'success');
    } catch(e) { 
        console.error(e);
        UI.toast('Gagal memproses transaksi: ' + e.message, 'error');
    }
    UI.hideLoader();
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    // Jalankan pengecekan sesi saat halaman dimuat
    checkSession();
    
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.querySelectorAll('.nav-link').forEach(link => { link.addEventListener('click', (e) => { e.preventDefault(); UI.switchPage(e.currentTarget.dataset.page); }); });
    const nmInput = document.getElementById('input-nominal');
    if(nmInput) nmInput.addEventListener('keyup', function() { this.value = UI.formatRpInput(this.value); });
    const dtInput = document.getElementById('input-tanggal');
    if (dtInput) dtInput.valueAsDate = new Date();
    ['filter-search','filter-ruang','filter-tgl-awal','filter-tgl-akhir'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyFilters);
    });
    
    // Dynamic Dropdown Bangunan -> Ruang (Form Transaksi)
    document.getElementById('input-bangunan')?.addEventListener('change', function(e) {
        const bId = e.target.value;
        const filteredRuang = bId ? masterData.ruang.filter(r => r.id_bangunan === bId) : [];
        const renderModalOpts = (arr) => '<option value="">-- Pilih --</option>' + arr.map(x => `<option value="${x.id}">${x.nama}</option>`).join('');
        document.getElementById('input-ruang').innerHTML = bId ? renderModalOpts(filteredRuang) : '<option value="">-- Pilih Bangunan Dulu --</option>';
    });
    
    // Dynamic Dropdown Bangunan -> Ruang (Modal Ekspor)
    document.getElementById('export-bangunan')?.addEventListener('change', function(e) {
        const bId = e.target.value;
        const container = document.getElementById('export-ruang-container');
        if (bId === 'all') {
            container.style.display = 'none';
            document.getElementById('export-ruang').innerHTML = '<option value="all">-- Semua Ruang --</option>';
        } else {
            container.style.display = 'block';
            const filteredRuang = masterData.ruang.filter(r => r.id_bangunan === bId);
            const renderModalOpts = (arr) => '<option value="all">-- Semua Ruang (di Bangunan ini) --</option>' + arr.map(x => `<option value="${x.id}">${x.nama}</option>`).join('');
            document.getElementById('export-ruang').innerHTML = renderModalOpts(filteredRuang);
        }
    });

    // Dynamic Dropdown Bangunan -> Ruang (Modal Alokasi)
    document.getElementById('alokasi-bangunan')?.addEventListener('change', function(e) {
        const bId = e.target.value;
        const filteredRuang = bId ? masterData.ruang.filter(r => r.id_bangunan === bId) : [];
        const renderModalOpts = (arr) => '<option value="">-- Pilih --</option>' + arr.map(x => `<option value="${x.id}">${x.nama}</option>`).join('');
        document.getElementById('alokasi-ruang').innerHTML = bId ? renderModalOpts(filteredRuang) : '<option value="">-- Pilih Bangunan Dulu --</option>';
    });

    // Format Nominal Alokasi Dana
    const alokasiNominal = document.getElementById('alokasi-nominal');
    if (alokasiNominal) {
        alokasiNominal.addEventListener('keyup', function() { 
            this.value = UI.formatRpInput(this.value); 
        });
    }

    // Auto-refresh Dashboard button support (since it no longer fetches from API)
    document.querySelector('button[onclick="loadDashboard()"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        syncAllData(true);
        UI.toast('Memperbarui data dari server...', 'info');
    });

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
