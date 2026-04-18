'use client'

import { useState, useRef } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'

type Props = {
  valor: string          // URL actual
  onChange: (url: string) => void
  label?: string
  carpeta: string        // 'cuentas' | 'categorias'
  id: string             // id del registro para nombre del archivo
}

export function ImagenUploader({ valor, onChange, label = 'Imagen', carpeta, id }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const inputRef                  = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se aceptan imágenes (PNG, JPG, WebP)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen no puede superar 2MB')
      return
    }

    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('carpeta', carpeta)
    formData.append('id', id || Date.now().toString())

    const res = await fetch('/api/upload-imagen', { method: 'POST', body: formData })
    setUploading(false)

    if (res.ok) {
      const { url } = await res.json()
      onChange(url)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Error al subir la imagen')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const limpiar = () => onChange('')

  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>

      {valor ? (
        // Preview de imagen actual
        <div className="relative inline-block">
          <img
            src={valor}
            alt="Imagen"
            className="w-20 h-20 object-cover rounded-xl border border-slate-200"
          />
          <div className="absolute -top-2 -right-2 flex gap-1">
            <button
              onClick={() => inputRef.current?.click()}
              className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors"
              title="Cambiar imagen"
            >
              <Upload size={11} />
            </button>
            <button
              onClick={limpiar}
              className="w-6 h-6 rounded-full bg-red-400 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
              title="Quitar imagen"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      ) : (
        // Zona de drop
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
        >
          {uploading ? (
            <div className="text-sm text-slate-400">Subiendo...</div>
          ) : (
            <>
              <ImageIcon size={24} className="text-slate-300" />
              <p className="text-sm text-slate-400 text-center">
                Arrastrá una imagen o hacé click para seleccionar
              </p>
              <p className="text-xs text-slate-300">PNG, JPG, WebP · Máx 2MB</p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-red-500 mt-1.5">{error}</p>
      )}
    </div>
  )
}
