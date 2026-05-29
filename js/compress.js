/**
 * Modul kompresi gambar menggunakan Canvas API
 */

const ImageCompressor = {
    /**
     * Mengompres file gambar menjadi format base64
     * @param {File} file - File gambar dari input
     * @param {number} maxMB - Maksimal ukuran dalam Megabyte (default 1MB)
     * @returns {Promise<{base64: string, sizeInfo: string}>}
     */
    async compress(file, maxMB = 1) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error("File tidak ditemukan"));
                return;
            }

            const maxBytes = maxMB * 1024 * 1024;
            const reader = new FileReader();

            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");

                    // Hitung dimensi baru (opsional: batasi resolusi maksimal 1920x1920)
                    const MAX_WIDTH = 1920;
                    const MAX_HEIGHT = 1920;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    // Mulai kompresi
                    let quality = 0.9;
                    let dataUrl = canvas.toDataURL("image/jpeg", quality);

                    // Loop untuk menurunkan kualitas jika masih di atas maxBytes
                    // Estimasi ukuran base64: length * (3/4)
                    while (Math.round(dataUrl.length * 0.75) > maxBytes && quality > 0.1) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL("image/jpeg", quality);
                    }

                    const finalSize = Math.round(dataUrl.length * 0.75);
                    if (finalSize > maxBytes) {
                        reject(new Error(`Gagal mengompres di bawah ${maxMB}MB. Ukuran akhir: ${(finalSize/1024/1024).toFixed(2)}MB`));
                    } else {
                        // Pisahkan header "data:image/jpeg;base64,"
                        const base64Data = dataUrl.split(",")[1];
                        resolve({
                            base64: base64Data,
                            sizeInfo: (finalSize / 1024).toFixed(2) + " KB"
                        });
                    }
                };
                img.onerror = () => reject(new Error("Gagal memuat gambar"));
                img.src = event.target.result;
            };
            reader.onerror = () => reject(new Error("Gagal membaca file"));
            reader.readAsDataURL(file);
        });
    }
};
