
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type CartItem = {
  id: string
  name: string
  price: number
  imageUrl: string
  storeId: string
  storeName: string
  quantity: number
}

type CartContextType = {
  items: CartItem[]
  itemCount: number
  subtotal: number
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  updateQuantity: (id: string, quantity: number) => void
  removeItem: (id: string) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextType | null>(null)

const STORAGE_KEY = 'rexgroups-marketplace-cart'

// The order API rejects quantities above 20, so the cart enforces it too.
const MAX_QUANTITY = 20

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false

  const item = value as Record<string, unknown>

  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.price === 'number' &&
    Number.isFinite(item.price) &&
    typeof item.storeId === 'string' &&
    typeof item.storeName === 'string' &&
    typeof item.quantity === 'number' &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1
  )
}

function loadCart(): CartItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = saved ? JSON.parse(saved) : []

    if (!Array.isArray(parsed)) return []

    return parsed.filter(isCartItem).map((item) => ({
      ...item,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : '',
      quantity: Math.min(item.quantity, MAX_QUANTITY),
    }))
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage unavailable (private mode or full): keep the cart in memory.
    }
  }, [items])

  function addItem(item: Omit<CartItem, 'quantity'>) {
    setItems((current) => {
      const existing = current.find((entry) => entry.id === item.id)

      if (existing) {
        return current.map((entry) =>
          entry.id === item.id
            ? {
              ...entry,
              quantity: Math.min(entry.quantity + 1, MAX_QUANTITY),
            }
            : entry,
        )
      }

      return [...current, { ...item, quantity: 1 }]
    })
  }

  function updateQuantity(id: string, quantity: number) {
    if (quantity < 1) return

    const safeQuantity = Math.min(quantity, MAX_QUANTITY)

    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity: safeQuantity } : item,
      ),
    )
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  function clearCart() {
    setItems([])
  }

  const itemCount = items.reduce((total, item) => total + item.quantity, 0)

  const subtotal = items.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  )

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotal,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)

  if (!context) {
    throw new Error('useCart must be used inside CartProvider')
  }

  return context
}
