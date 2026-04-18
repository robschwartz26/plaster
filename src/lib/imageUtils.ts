export async function flipImageHorizontally(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.scale(-1, 1)
      ctx.drawImage(img, -img.naturalWidth, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        b => { if (b) resolve(b); else reject(new Error('flipImageHorizontally: toBlob failed')) },
        file.type || 'image/jpeg',
        0.95,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('flipImageHorizontally: image load failed')) }
    img.src = url
  })
}

export async function processCaptureFile(
  file: File,
  _captureSource: string | null,
  _log?: (msg: string) => void,
): Promise<File> {
  return file
}
