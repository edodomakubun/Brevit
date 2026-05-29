/**
 * Modul Komunikasi API ke Google Apps Script
 */

// TODO: Ganti URL ini dengan Web App URL dari Google Apps Script setelah di-deploy
const GAS_URL = "https://script.google.com/macros/s/AKfycbxo_WjkTvT4YPj11QcPA2wIwzkS8SNwqyLLA7eaSxZP6i6hY8nioCzbMBfE5BGo1olHpQ/exec"; 

const API = {
    /**
     * Mengirim request POST ke Google Apps Script
     * @param {string} action - Nama aksi (login, submitTrx, getKomparasi, dll)
     * @param {object} payload - Data payload
     * @returns {Promise<any>}
     */
    async post(action, payload = {}) {
        try {
            // Menggunakan method POST dengan body text/plain untuk menghindari CORS preflight issues di GAS
            const response = await fetch(GAS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8",
                },
                body: JSON.stringify({ action, ...payload })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error("API Error:", error);
            throw new Error("Gagal terhubung ke server. Pastikan URL GAS sudah benar.");
        }
    },

    /**
     * Memanggil fungsi get data (GET request)
     */
    async get(action, params = {}) {
        try {
            const url = new URL(GAS_URL);
            url.searchParams.append("action", action);
            for(let key in params) {
                url.searchParams.append(key, params[key]);
            }
            
            const response = await fetch(url.toString(), {
                method: "GET"
            });
            const result = await response.json();
            return result;
        } catch (error) {
            console.error("API GET Error:", error);
            throw new Error("Gagal mengambil data dari server.");
        }
    }
};
