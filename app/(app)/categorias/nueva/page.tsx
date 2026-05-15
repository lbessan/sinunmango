import { EditarCategoriaClient } from '@/components/editar-categoria-client'

export default function NuevaCategoriaPage() {
  return (
    <EditarCategoriaClient
      categoria={{ nombre_categoria: '', icono: '🏷️', tipo_default: 'Gasto' }}
    />
  )
}