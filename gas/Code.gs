/**
 * Backend API untuk Sistem Buku Kas Revitalisasi Sekolah
 */

function doPost(e) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  try {
    const rawData = e.postData.contents;
    const payload = JSON.parse(rawData);
    
    let result = { status: "error", message: "Action tidak dikenali" };

    switch (payload.action) {
      case "login":
        result = handleLogin(payload);
        break;
      case "get_master":
        result = handleGetMaster();
        break;
      case "add_master":
        result = handleAddMaster(payload);
        break;
      case "delete_master":
        result = handleDeleteMaster(payload);
        break;
      case "submit_transaksi":
        result = handleSubmitTransaksi(payload);
        break;
      case "get_buku_kas":
        result = handleGetBukuKas(payload);
        break;
      case "get_dashboard":
        result = handleGetDashboard();
        break;
    }

    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "API Buku Kas Revitalisasi Aktif" }))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// ROUTE HANDLERS
// ==========================================

function handleLogin(payload) {
  const { username, password } = payload;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) throw new Error("Database belum disetup.");

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[1] == username && row[2] == password && row[5] == true) {
      return {
        status: "success",
        data: { id: row[0], username: row[1], role: row[3], nama: row[4] }
      };
    }
  }
  return { status: "error", message: "Username atau Password salah." };
}

function handleGetMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const getSheetData = (name) => {
    const s = ss.getSheetByName(name);
    if (!s) return [];
    const d = s.getDataRange().getValues();
    d.shift(); // remove header
    return d;
  };

  const bgn = getSheetData("Master_Bangunan").map(r => ({ id: r[0], nama: r[1] }));
  const rng = getSheetData("Master_Ruang").map(r => ({ id: r[0], id_bangunan: r[1], nama: r[2] }));
  const pos = getSheetData("Master_Pos").map(r => ({ id: r[0], nama: r[1] }));

  return {
    status: "success",
    data: { bangunan: bgn, ruang: rng, pos: pos }
  };
}

function handleAddMaster(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet;
  let rowData = [];
  const id = Utilities.getUuid().split('-')[0].toUpperCase();

  if (payload.type === 'bangunan') {
    sheet = ss.getSheetByName("Master_Bangunan");
    rowData = ["BGN-" + id, payload.nama];
  } else if (payload.type === 'ruang') {
    sheet = ss.getSheetByName("Master_Ruang");
    rowData = ["RNG-" + id, payload.id_bangunan, payload.nama];
  } else if (payload.type === 'pos') {
    sheet = ss.getSheetByName("Master_Pos");
    rowData = ["POS-" + id, payload.nama];
  } else {
    throw new Error("Tipe master tidak valid.");
  }

  if (sheet) sheet.appendRow(rowData);
  return { status: "success", message: "Data master berhasil ditambahkan." };
}

function handleDeleteMaster(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetName = "";
  if (payload.type === 'bangunan') sheetName = "Master_Bangunan";
  else if (payload.type === 'ruang') sheetName = "Master_Ruang";
  else if (payload.type === 'pos') sheetName = "Master_Pos";

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet tidak ditemukan.");

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.id) {
      sheet.deleteRow(i + 1);
      return { status: "success", message: "Data berhasil dihapus." };
    }
  }
  return { status: "error", message: "Data tidak ditemukan." };
}

function handleSubmitTransaksi(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Buku_Kas");
  if (!sheet) throw new Error("Sheet Buku_Kas tidak ditemukan.");

  const data = sheet.getDataRange().getValues();
  
  let saldoAkhirSebelumnya = 0;
  // Cari transaksi terakhir untuk ruang yang sama untuk mendapatkan saldo awal
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][10] === payload.id_ruang) { // index 10 adalah id_ruang
      saldoAkhirSebelumnya = parseFloat(data[i][7]) || 0; // index 7 adalah saldo_akhir
      break;
    }
  }

  const debet = parseFloat(payload.debet) || 0;
  const kredit = parseFloat(payload.kredit) || 0;
  const saldoAwal = saldoAkhirSebelumnya;
  const saldoAkhir = saldoAwal + debet - kredit;

  if (saldoAkhir < 0) {
    throw new Error("Transaksi ditolak: Saldo akhir tidak boleh negatif.");
  }

  const idTrx = "TRX-" + Utilities.getUuid().split('-')[0].toUpperCase();
  
  // id_trx | tanggal | uraian | pos_belanja | debet | kredit | saldo_awal | saldo_akhir | keterangan | id_bangunan | id_ruang | created_by
  sheet.appendRow([
    idTrx,
    new Date(payload.tanggal),
    payload.uraian,
    payload.pos_belanja,
    debet,
    kredit,
    saldoAwal,
    saldoAkhir,
    payload.keterangan || "",
    payload.id_bangunan,
    payload.id_ruang,
    payload.username
  ]);

  return { status: "success", message: "Transaksi berhasil dicatat." };
}

function handleGetBukuKas(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Buku_Kas");
  if (!sheet) throw new Error("Sheet Buku_Kas tidak ditemukan.");

  const data = sheet.getDataRange().getValues();
  let result = [];

  // Ambil nama bangunan dan ruang
  const mstData = handleGetMaster().data;
  const mapBgn = {}; mstData.bangunan.forEach(b => mapBgn[b.id] = b.nama);
  const mapRng = {}; mstData.ruang.forEach(r => mapRng[r.id] = r.nama);
  const mapPos = {}; mstData.pos.forEach(p => mapPos[p.id] = p.nama);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Filter by Ruang (jika diminta)
    if (payload.id_ruang && row[10] !== payload.id_ruang) continue;

    result.push({
      id: row[0],
      tanggal: Utilities.formatDate(new Date(row[1]), Session.getScriptTimeZone(), "yyyy-MM-dd"),
      uraian: row[2],
      pos: mapPos[row[3]] || row[3],
      debet: row[4],
      kredit: row[5],
      saldo_awal: row[6],
      saldo_akhir: row[7],
      keterangan: row[8],
      bangunan: mapBgn[row[9]] || row[9],
      ruang: mapRng[row[10]] || row[10],
      operator: row[11]
    });
  }

  return { status: "success", data: result };
}

function handleGetDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Buku_Kas");
  
  let totalDebet = 0;
  let totalKredit = 0;
  let rekapRuang = {}; // { id_ruang: { id_bangunan, debet, kredit, saldo_akhir } }

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const dbt = parseFloat(data[i][4]) || 0;
      const krd = parseFloat(data[i][5]) || 0;
      const rId = data[i][10];
      const bId = data[i][9];
      const sAk = parseFloat(data[i][7]) || 0;

      totalDebet += dbt;
      totalKredit += krd;

      if (!rekapRuang[rId]) {
        rekapRuang[rId] = { bId: bId, debet: 0, kredit: 0, saldo_akhir: 0 };
      }
      rekapRuang[rId].debet += dbt;
      rekapRuang[rId].kredit += krd;
      rekapRuang[rId].saldo_akhir = sAk; // Karena berurutan, yang terakhir adalah saldo terkini
    }
  }

  const mstData = handleGetMaster().data;
  const bgnMap = {}; mstData.bangunan.forEach(b => bgnMap[b.id] = { nama: b.nama, total_saldo: 0, total_pengeluaran: 0 });
  const rngMap = {}; mstData.ruang.forEach(r => rngMap[r.id] = r.nama);

  // Roll up to bangunan
  for (let rId in rekapRuang) {
    const bId = rekapRuang[rId].bId;
    if (bgnMap[bId]) {
      bgnMap[bId].total_saldo += rekapRuang[rId].saldo_akhir;
      bgnMap[bId].total_pengeluaran += rekapRuang[rId].kredit;
    }
  }

  const ringkasanRuang = Object.keys(rekapRuang).map(rId => ({
    nama: rngMap[rId] || "Ruang Tidak Diketahui",
    saldo: rekapRuang[rId].saldo_akhir
  }));

  const ringkasanBangunan = Object.keys(bgnMap).map(bId => ({
    nama: bgnMap[bId].nama,
    pengeluaran: bgnMap[bId].total_pengeluaran,
    saldo: bgnMap[bId].total_saldo
  }));

  return {
    status: "success",
    data: {
      totalPemasukan: totalDebet,
      totalPengeluaran: totalKredit,
      totalSaldo: totalDebet - totalKredit,
      ringkasanBangunan: ringkasanBangunan,
      ringkasanRuang: ringkasanRuang
    }
  };
}

// ==========================================
// SETUP DATABASE
// ==========================================

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheetsConfig = [
    {
      name: "Users",
      headers: ["id", "username", "password_hash", "role", "nama_lengkap", "status_aktif"],
      dummyData: [
        ["U-001", "admin", "12345", "kepsek", "Bapak Kepala Sekolah", true],
        ["U-002", "bendahara", "12345", "bendahara", "Ibu Bendahara", true]
      ]
    },
    {
      name: "Master_Bangunan",
      headers: ["id_bangunan", "nama_bangunan"],
      dummyData: [
        ["BGN-D", "Bangunan D"],
        ["BGN-A", "Bangunan A"],
        ["BGN-C", "Bangunan C"]
      ]
    },
    {
      name: "Master_Ruang",
      headers: ["id_ruang", "id_bangunan", "nama_ruang"],
      dummyData: [
        ["RNG-1", "BGN-D", "RKB 1"],
        ["RNG-2", "BGN-D", "RKB 2"],
        ["RNG-3", "BGN-A", "Ruang Kelas 1"]
      ]
    },
    {
      name: "Master_Pos",
      headers: ["id_pos", "nama_pos"],
      dummyData: [
        ["POS-1", "Material & Bahan Bangunan"],
        ["POS-2", "Upah Tukang"],
        ["POS-3", "Cat & Finishing"],
        ["POS-4", "Transportasi"]
      ]
    },
    {
      name: "Buku_Kas",
      headers: ["id_trx", "tanggal", "uraian", "id_pos", "debet", "kredit", "saldo_awal", "saldo_akhir", "keterangan", "id_bangunan", "id_ruang", "created_by"],
      dummyData: []
    }
  ];

  sheetsConfig.forEach(config => {
    let sheet = ss.getSheetByName(config.name);
    if (!sheet) {
      sheet = ss.insertSheet(config.name);
    } else {
      sheet.clear();
    }
    sheet.appendRow(config.headers);
    sheet.getRange(1, 1, 1, config.headers.length).setFontWeight("bold").setBackground("#c9daf8");
    if (config.dummyData.length > 0) {
      sheet.getRange(2, 1, config.dummyData.length, config.headers.length).setValues(config.dummyData);
    }
    sheet.autoResizeColumns(1, config.headers.length);
  });

  const sheetsToDelete = ["Transaksi", "Harga Asli", "Harga Belanja", "RKelas_1", "RKelas_2", "RKelas_3", "RKelas_4", "RKelas_5", "RKelas_6", "RKelas_7", "Perbandingan Harga Asli dan Harga Belanja", "URL Dokumen Ekspor", "Sheet1"];
  sheetsToDelete.forEach(s => {
    let sht = ss.getSheetByName(s);
    if (sht) ss.deleteSheet(sht);
  });

  Logger.log("Setup Database Baru Selesai!");
}
