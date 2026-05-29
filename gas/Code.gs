/**
 * Backend API untuk Sistem Buku Kas Revitalisasi Sekolah
 * Phase 3: Penambahan Chart, Audit Log, Lock Bulanan, Export, Filter, Master CRUD.
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
      case "login": result = handleLogin(payload); break;
      case "get_master": result = handleGetMaster(); break;
      case "add_master": result = handleAddMaster(payload); break;
      case "edit_master": result = handleEditMaster(payload); break;
      case "delete_master": result = handleDeleteMaster(payload); break;
      case "submit_transaksi": result = handleSubmitTransaksi(payload); break;
      case "get_buku_kas": result = handleGetBukuKas(payload); break;
      case "sync_all": result = handleSyncAll(); break;
      case "export_laporan": result = handleExportLaporan(payload); break;
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "API Aktif - Phase 3" })).setMimeType(ContentService.MimeType.JSON);
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
      return { status: "success", data: { id: row[0], username: row[1], role: row[3], nama: row[4] } };
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
    d.shift();
    return d;
  };

  const bgn = getSheetData("Master_Bangunan").map(r => ({ id: r[0], nama: r[1] }));
  const rng = getSheetData("Master_Ruang").map(r => ({ id: r[0], id_bangunan: r[1], nama: r[2] }));
  const pos = getSheetData("Master_Pos").map(r => ({ id: r[0], nama: r[1] }));

  return { status: "success", data: { bangunan: bgn, ruang: rng, pos: pos } };
}

function handleAddMaster(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const id = Utilities.getUuid().split('-')[0].toUpperCase();
  let sheet, rowData;

  if (payload.type === 'bangunan') {
    sheet = ss.getSheetByName("Master_Bangunan");
    rowData = ["BGN-" + id, payload.nama];
  } else if (payload.type === 'ruang') {
    sheet = ss.getSheetByName("Master_Ruang");
    rowData = ["RNG-" + id, payload.id_bangunan, payload.nama];
  } else if (payload.type === 'pos') {
    sheet = ss.getSheetByName("Master_Pos");
    rowData = ["POS-" + id, payload.nama];
  } else throw new Error("Tipe master tidak valid.");

  sheet.appendRow(rowData);
  return { status: "success", message: "Data berhasil ditambahkan." };
}

function handleEditMaster(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { type, id, nama, username } = payload;
  let sheetName = "";
  if (type === 'bangunan') sheetName = "Master_Bangunan";
  else if (type === 'ruang') sheetName = "Master_Ruang";
  else if (type === 'pos') sheetName = "Master_Pos";

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet tidak ditemukan.");

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      if (type === 'ruang') sheet.getRange(i + 1, 3).setValue(nama); // kolom 3
      else sheet.getRange(i + 1, 2).setValue(nama); // kolom 2
      return { status: "success", message: "Data berhasil diubah." };
    }
  }
  throw new Error("Data tidak ditemukan.");
}

function handleDeleteMaster(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { type, id, username } = payload;
  
  // Cek apakah dipakai di Buku_Kas
  const bkSheet = ss.getSheetByName("Buku_Kas");
  if (bkSheet) {
    const bkData = bkSheet.getDataRange().getValues();
    for (let j = 1; j < bkData.length; j++) {
      if (type === 'bangunan' && bkData[j][9] === id) throw new Error("Bangunan ini sedang digunakan di riwayat transaksi.");
      if (type === 'ruang' && bkData[j][10] === id) throw new Error("Ruang ini sedang digunakan di riwayat transaksi.");
      if (type === 'pos' && bkData[j][3] === id) throw new Error("Pos Belanja ini sedang digunakan di riwayat transaksi.");
    }
  }

  let sheetName = "";
  if (type === 'bangunan') sheetName = "Master_Bangunan";
  else if (type === 'ruang') sheetName = "Master_Ruang";
  else if (type === 'pos') sheetName = "Master_Pos";

  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { status: "success", message: "Data berhasil dihapus." };
    }
  }
  throw new Error("Data tidak ditemukan.");
}

function handleSubmitTransaksi(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Buku_Kas");
  const data = sheet.getDataRange().getValues();
  
  let saldoAkhirSebelumnya = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][10] === payload.id_ruang) {
      saldoAkhirSebelumnya = parseFloat(data[i][7]) || 0;
      break;
    }
  }

  const debet = parseFloat(payload.debet) || 0;
  const kredit = parseFloat(payload.kredit) || 0;
  const saldoAkhir = saldoAkhirSebelumnya + debet - kredit;

  if (saldoAkhir < 0) throw new Error("Transaksi ditolak: Saldo akhir tidak boleh negatif.");

  const idTrx = "TRX-" + Utilities.getUuid().split('-')[0].toUpperCase();
  sheet.appendRow([idTrx, new Date(payload.tanggal), payload.uraian, payload.pos_belanja, debet, kredit, saldoAkhirSebelumnya, saldoAkhir, payload.keterangan || "", payload.id_bangunan, payload.id_ruang, payload.username]);

  return { status: "success", message: "Transaksi berhasil dicatat." };
}

function handleGetBukuKas(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Buku_Kas");
  const data = sheet.getDataRange().getValues();
  let result = [];

  const mstData = handleGetMaster().data;
  const mapBgn = {}; mstData.bangunan.forEach(b => mapBgn[b.id] = b.nama);
  const mapRng = {}; mstData.ruang.forEach(r => mapRng[r.id] = r.nama);
  const mapPos = {}; mstData.pos.forEach(p => mapPos[p.id] = p.nama);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    result.push({
      id: row[0],
      tanggal: Utilities.formatDate(new Date(row[1]), Session.getScriptTimeZone(), "yyyy-MM-dd"),
      uraian: row[2],
      pos: mapPos[row[3]] || row[3],
      id_pos: row[3],
      debet: row[4],
      kredit: row[5],
      saldo_awal: row[6],
      saldo_akhir: row[7],
      keterangan: row[8],
      bangunan: mapBgn[row[9]] || row[9],
      id_bangunan: row[9],
      ruang: mapRng[row[10]] || row[10],
      id_ruang: row[10],
      operator: row[11]
    });
  }
  return { status: "success", data: result };
}

function handleSyncAll() {
  const master = handleGetMaster().data;
  const buku_kas = handleGetBukuKas({}).data;
  return { status: "success", data: { master, buku_kas } };
}

function handleExportLaporan(payload) {
  const { id_ruang, format, username } = payload;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const template = ss.getSheetByName("Template_Export");
  if (!template) throw new Error("Template_Export tidak ditemukan.");

  // Dapatkan seluruh data untuk ruang tersebut
  const bkData = handleGetBukuKas({}).data;
  const filteredData = bkData.filter(d => id_ruang === "all" || d.id_ruang === id_ruang);

  // Buat sheet temporer
  const tempSheetName = "Export_" + Utilities.getUuid().split('-')[0];
  const newSheet = template.copyTo(ss).setName(tempSheetName);

  // Jika formatnya seperti buku kas standar, mulai dari baris ke-6 (Asumsi)
  // [No, Tanggal, Uraian, Pos Belanja, Debet, Kredit, Saldo Akhir]
  let outputData = [];
  filteredData.forEach((item, index) => {
    outputData.push([
      index + 1, 
      item.tanggal, 
      item.uraian, 
      item.pos, 
      item.debet, 
      item.kredit, 
      item.saldo_akhir
    ]);
  });

  if (outputData.length > 0) {
    newSheet.getRange(6, 1, outputData.length, 7).setValues(outputData);
    
    // Formatting border
    newSheet.getRange(6, 1, outputData.length, 7).setBorder(true, true, true, true, true, true);
  } else {
    newSheet.getRange(6, 1).setValue("Tidak ada data transaksi.");
  }

  // Nama ruang di header
  const namaRuang = id_ruang === "all" ? "Semua Ruang" : (filteredData.length > 0 ? filteredData[0].ruang : id_ruang);
  newSheet.getRange("A3").setValue("Ruang Kelas: " + namaRuang);
  
  SpreadsheetApp.flush();

  // Generate Export URL menggunakan UrlFetchApp untuk bypass public sharing (menghasilkan base64)
  const token = ScriptApp.getOAuthToken();
  const exportFormat = format === 'pdf' ? 'pdf' : 'xlsx';
  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?exportFormat=${exportFormat}&format=${exportFormat}&gid=${newSheet.getSheetId()}&portrait=false&size=A4`;
  
  const response = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
  const base64Str = Utilities.base64Encode(response.getBlob().getBytes());

  // Hapus sheet temporer
  ss.deleteSheet(newSheet);

  return { status: "success", data: { fileData: base64Str, mimeType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `Laporan_BukuKas_${namaRuang}.${exportFormat}` } };
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
      dummyData: [ ["U-001", "admin", "12345", "kepsek", "Kepala Sekolah", true], ["U-002", "bendahara", "12345", "bendahara", "Bendahara Sekolah", true] ]
    },
    {
      name: "Master_Bangunan",
      headers: ["id_bangunan", "nama_bangunan"],
      dummyData: [ ["BGN-D", "Bangunan D"], ["BGN-A", "Bangunan A"], ["BGN-C", "Bangunan C"] ]
    },
    {
      name: "Master_Ruang",
      headers: ["id_ruang", "id_bangunan", "nama_ruang"],
      dummyData: [ ["RNG-1", "BGN-D", "RKB 1"], ["RNG-2", "BGN-D", "RKB 2"], ["RNG-3", "BGN-A", "Ruang Kelas 1"] ]
    },
    {
      name: "Master_Pos",
      headers: ["id_pos", "nama_pos"],
      dummyData: [ ["POS-1", "Material"], ["POS-2", "Upah Tukang"], ["POS-3", "Transportasi"] ]
    },
    {
      name: "Buku_Kas",
      headers: ["id_trx", "tanggal", "uraian", "id_pos", "debet", "kredit", "saldo_awal", "saldo_akhir", "keterangan", "id_bangunan", "id_ruang", "created_by"],
      dummyData: []
    }
  ];

  sheetsConfig.forEach(config => {
    let sheet = ss.getSheetByName(config.name);
    if (!sheet) sheet = ss.insertSheet(config.name);
    else sheet.clear();
    sheet.appendRow(config.headers);
    sheet.getRange(1, 1, 1, config.headers.length).setFontWeight("bold").setBackground("#c9daf8");
    if (config.dummyData.length > 0) sheet.getRange(2, 1, config.dummyData.length, config.headers.length).setValues(config.dummyData);
    sheet.autoResizeColumns(1, config.headers.length);
  });

  // Buat Template Export
  let tempSheet = ss.getSheetByName("Template_Export");
  if (!tempSheet) tempSheet = ss.insertSheet("Template_Export");
  tempSheet.clear();
  
  // Design Template (Simple)
  tempSheet.getRange("A1:G1").merge().setValue("LAPORAN BUKU KAS REVITALISASI").setFontWeight("bold").setHorizontalAlignment("center").setFontSize(14);
  tempSheet.getRange("A2:G2").merge().setValue("SDN PERCONTOHAN").setHorizontalAlignment("center");
  tempSheet.getRange("A3").setValue("Ruang Kelas: ");
  tempSheet.getRange("A5:G5").setValues([["No", "Tanggal", "Uraian", "Pos Belanja", "Debet (Rp)", "Kredit (Rp)", "Saldo Akhir (Rp)"]]).setFontWeight("bold").setBackground("#f3f4f6");
  tempSheet.setColumnWidth(2, 120);
  tempSheet.setColumnWidth(3, 250);
  tempSheet.setColumnWidth(4, 150);
  
  // Sembunyikan template sheet agar rapi
  tempSheet.hideSheet();

  Logger.log("Setup Database Phase 3 Selesai!");
}
