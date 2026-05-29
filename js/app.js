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

    const tbody = document.getElementById('table-buku-kas');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    if (filtered.length > 0) {
        filtered.forEach(item => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 border-b border-slate-50">
                    <td class="px-4 py-3 whitespace-nowrap text-slate-500">${UI.formatDateID(item.tanggal)}</td>
                    <td class="px-4 py-3 font-medium text-slate-800">${item.uraian}</td>
                    <td class="px-4 py-3 text-xs text-slate-500">${item.keterangan || '-'}</td>
                    <td class="px-4 py-3 text-xs text-slate-600">${item.bangunan} / ${item.ruang}</td>
                    <td class="px-4 py-3 text-sm">${item.pos || '-'}</td>
                    <td class="px-4 py-3 text-right text-emerald-600 font-medium">${item.debet > 0 ? UI.formatRp(item.debet) : '-'}</td>
                    <td class="px-4 py-3 text-right text-red-600 font-medium">${item.kredit > 0 ? UI.formatRp(item.kredit) : '-'}</td>
                    <td class="px-4 py-3 text-right text-blue-700 font-bold">${UI.formatRp(item.saldo_akhir)}</td>
                </tr>
            `;
        });
    } else tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>';
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
        document.getElementById('dash-pemasukan').textContent = UI.formatRp(totalDebet);
        document.getElementById('dash-pengeluaran').textContent = UI.formatRp(totalKredit);
        document.getElementById('dash-saldo').textContent = UI.formatRp(totalDebet - totalKredit);
        
        document.getElementById('dash-bangunan-list').innerHTML = ringkasanBangunan.map(b => `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="font-medium text-slate-700">${b.nama}</span>
                <div class="text-right">
                    <div class="text-sm font-bold text-slate-800">${UI.formatRp(b.saldo)}</div>
                    <div class="text-[10px] text-red-500">Kredit: ${UI.formatRp(b.pengeluaran)}</div>
                </div>
            </div>
        `).join('') || '<p class="text-sm text-slate-400">Belum ada data.</p>';
        
        document.getElementById('dash-ruang-list').innerHTML = ringkasanRuang.map(r => `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="text-sm text-slate-700">${r.nama}</span><span class="text-sm font-bold text-blue-600">${UI.formatRp(r.saldo)}</span>
            </div>
        `).join('') || '<p class="text-sm text-slate-400">Kosong</p>';
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
    const ruang = document.getElementById('export-ruang').value;
    document.getElementById('modal-export').classList.add('hidden');
    UI.showLoader(`Menyiapkan file ${format.toUpperCase()}...`);
    
    try {
        const filtered = ruang === 'all' ? currentBukuKasData : currentBukuKasData.filter(d => d.id_ruang === ruang);
        const namaRuang = ruang === 'all' ? 'Semua Ruang' : (filtered.length > 0 ? filtered[0].ruang : 'Tidak Diketahui');

        const headers = [["No", "Tanggal", "Uraian", "Keterangan", "Pos Belanja", "Debet (Rp)", "Kredit (Rp)", "Saldo Akhir (Rp)"]];
        const rows = filtered.map((item, index) => [
            index + 1, UI.formatDateID(item.tanggal), item.uraian, item.keterangan || '-', item.pos || '-', item.debet || 0, item.kredit || 0, item.saldo_akhir || 0
        ]);

        if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Buku Kas');

            worksheet.getCell('A1').value = 'LAPORAN BUKU KAS REVITALISASI';
            worksheet.getCell('A1').font = { bold: true, size: 14 };
            worksheet.getCell('A2').value = 'SDN PERCONTOHAN';
            worksheet.getCell('A2').font = { bold: true };
            worksheet.getCell('A3').value = `Ruang Kelas: ${namaRuang}`;
            worksheet.addRow([]);

            const headerRow = worksheet.addRow(headers[0]);
            headerRow.eachCell((cell) => {
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            rows.forEach((r) => {
                const row = worksheet.addRow(r);
                row.eachCell((cell, colNumber) => {
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    if (colNumber >= 6 && colNumber <= 8) cell.numFmt = '"Rp"#,##0';
                });
            });

            worksheet.columns = [
                { width: 6 }, { width: 14 }, { width: 40 }, { width: 35 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }
            ];

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Laporan_BukuKas_${namaRuang}.xlsx`;
            link.click();
        } 
        else if (format === 'pdf') {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'pt', 'a4'); 
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("LAPORAN BUKU KAS REVITALISASI", 40, 40);
            
            doc.setFontSize(12);
            doc.text("SDN PERCONTOHAN", 40, 60);
            doc.setFont("helvetica", "normal");
            doc.text(`Ruang Kelas: ${namaRuang}`, 40, 80);
            
            const formatRpPdf = (val) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(val);
            const bodyStr = rows.map(r => [r[0], r[1], r[2], r[3], r[4], formatRpPdf(r[5]), formatRpPdf(r[6]), formatRpPdf(r[7])]);

            doc.autoTable({
                startY: 100,
                head: headers,
                body: bodyStr,
                theme: 'grid',
                styles: { fontSize: 9 },
                headStyles: { fillColor: [30, 58, 138] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 30 },
                    5: { halign: 'right' },
                    6: { halign: 'right' },
                    7: { halign: 'right' }
                }
            });
            doc.save(`Laporan_BukuKas_${namaRuang}.pdf`);
        }
        UI.toast('Berhasil mengunduh laporan.', 'success');
    } catch(e) { 
        console.error(e);
        UI.toast('Gagal mengekspor laporan: ' + e.message, 'error'); 
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
