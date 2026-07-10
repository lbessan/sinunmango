// @vitest-environment happy-dom
//
// Tests para components/emoji-picker-modal.tsx
//
// El selector de iconos que el user ve al crear/editar categorías. Ahora
// renderiza imágenes 3D (Fluent) — cada botón lleva data-emoji para poder
// identificarlo en los tests. Cubrimos búsqueda, filtro por grupo, pick,
// custom fallback y active state.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import { EmojiPickerModal } from '@/components/emoji-picker-modal'

// ¿Hay en el grid un botón para este emoji?
const hasEmoji = (emoji: string) =>
  !!document.querySelector(`.grid [data-emoji="${emoji}"]`)

beforeEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('EmojiPickerModal — render condicional', () => {
  it('open=false → no renderea nada', () => {
    const { container } = render(<EmojiPickerModal
      open={false} current={null}
      onPick={() => {}} onClose={() => {}}
    />)
    expect(container.firstChild).toBeNull()
  })

  it('open=true → renderea el modal', () => {
    render(<EmojiPickerModal
      open={true} current={null}
      onPick={() => {}} onClose={() => {}}
    />)
    expect(screen.getByPlaceholderText(/Buscar emoji/)).toBeTruthy()
  })
})

describe('EmojiPickerModal — búsqueda', () => {
  it('búsqueda por keyword exacto: "nafta" filtra a transportes', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar emoji/), { target: { value: 'nafta' } })
    expect(hasEmoji('⛽')).toBe(true)
  })

  it('búsqueda case-insensitive: "SUPER" matchea como "super"', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar emoji/), { target: { value: 'SUPER' } })
    expect(hasEmoji('🛒')).toBe(true)
  })

  it('búsqueda sin tildes: "educacion" matchea "Educación"', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar emoji/), { target: { value: 'educacion' } })
    expect(hasEmoji('🎓')).toBe(true)
  })

  it('búsqueda por grupo: "transporte" matchea TODOS los del grupo', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar emoji/), { target: { value: 'transporte' } })
    expect(hasEmoji('🚗')).toBe(true)
    expect(hasEmoji('⛽')).toBe(true)
    expect(hasEmoji('🚌')).toBe(true)
  })

  it('búsqueda sin resultados → mensaje "Sin resultados"', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar emoji/), { target: { value: 'xyzabc123' } })
    expect(screen.getByText(/Sin resultados/)).toBeTruthy()
  })

  it('botón "Limpiar filtros" desde el empty state limpia query y grupo', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Buscar emoji/), { target: { value: 'xyzabc' } })
    fireEvent.click(screen.getByText('Limpiar filtros'))
    expect((screen.getByPlaceholderText(/Buscar emoji/) as HTMLInputElement).value).toBe('')
    expect(document.querySelector('.grid')).toBeTruthy()
  })
})

describe('EmojiPickerModal — filtro por grupo', () => {
  it('click en grupo "Comida" filtra solo emojis de ese grupo', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Comida'))
    expect(hasEmoji('🛒')).toBe(true)
    expect(hasEmoji('🚗')).toBe(false)  // transporte, no comida
  })

  it('"Todos" (default) muestra todos los emojis del catálogo', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    expect(hasEmoji('🛒')).toBe(true)
    expect(hasEmoji('🚗')).toBe(true)
    expect(hasEmoji('💊')).toBe(true)
  })

  it('cambiar de grupo cambia el filtro', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Comida'))
    fireEvent.click(screen.getByText('Salud'))
    expect(hasEmoji('💊')).toBe(true)
    expect(hasEmoji('🛒')).toBe(false)  // no es Salud
  })
})

describe('EmojiPickerModal — pick + close', () => {
  it('click en un emoji llama onPick(emoji) + onClose', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<EmojiPickerModal open={true} current={null} onPick={onPick} onClose={onClose} />)

    const cartBtn = document.querySelector('.grid [data-emoji="🛒"]') as HTMLButtonElement
    fireEvent.click(cartBtn)

    expect(onPick).toHaveBeenCalledWith('🛒')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('click en backdrop llama onClose (NO onPick)', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<EmojiPickerModal open={true} current={null} onPick={onPick} onClose={onClose} />)
    fireEvent.click(document.querySelector('.fixed.inset-0')!)
    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('click en X (header) llama onClose', () => {
    const onClose = vi.fn()
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={onClose} />)
    fireEvent.click(document.querySelector('button[title="Cerrar"]')!)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('EmojiPickerModal — emoji actual (active state)', () => {
  it('current="🚗" → el botón del 🚗 tiene outline activo', () => {
    render(<EmojiPickerModal open={true} current="🚗" onPick={() => {}} onClose={() => {}} />)
    const carBtn = document.querySelector('.grid [data-emoji="🚗"]') as HTMLButtonElement
    expect(carBtn.style.outline).toContain('var(--accent)')
  })

  it('current=null → ningún botón está active', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    const buttons = Array.from(document.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const activeCount = buttons.filter(b => b.style.outline?.includes('var(--accent)')).length
    expect(activeCount).toBe(0)
  })
})

describe('EmojiPickerModal — custom emoji fallback', () => {
  it('input "Otro" + "Usar" → onPick(custom) + onClose', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<EmojiPickerModal open={true} current={null} onPick={onPick} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Pegá tu emoji'), { target: { value: '🥭' } })
    fireEvent.click(screen.getByText('Usar'))
    expect(onPick).toHaveBeenCalledWith('🥭')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('"Usar" disabled cuando custom input vacío', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    expect((screen.getByText('Usar') as HTMLButtonElement).disabled).toBe(true)
  })

  it('custom input tiene maxLength=4', () => {
    render(<EmojiPickerModal open={true} current={null} onPick={() => {}} onClose={() => {}} />)
    expect((screen.getByPlaceholderText('Pegá tu emoji') as HTMLInputElement).maxLength).toBe(4)
  })
})
