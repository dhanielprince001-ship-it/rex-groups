
import { Link } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from './CartContext'

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

export default function MarketplaceCart() {
  const {
    items,
    itemCount,
    subtotal,
    updateQuantity,
    removeItem,
  } = useCart()

  return (
    <main className="rex-marketplace rex-cart-page">
      <header className="rex-market-header">
        <Link className="rex-market-brand" to="/marketplace">
          <span className="rex-market-brand-mark">R<span>.</span></span>
          <span>REX <b>MARKETPLACE</b></span>
        </Link>

        <Link to="/marketplace">Continue shopping</Link>
      </header>

      <section className="rex-cart-content">
        <Link className="rex-cart-back" to="/marketplace">
          <ArrowLeft size={16} /> Back to marketplace
        </Link>

        <div className="rex-cart-heading">
          <div>
            <span className="rex-market-eyebrow">YOUR SHOPPING BAG</span>
            <h1>Your <em>cart.</em></h1>
          </div>
          <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
        </div>

        {items.length === 0 ? (
          <div className="rex-cart-empty">
            <ShoppingBag size={42} />
            <h2>Your cart is empty.</h2>
            <p>Explore the marketplace and discover something worth finding.</p>
            <Link className="rex-market-primary-link" to="/marketplace">
              Explore products
            </Link>
          </div>
        ) : (
          <div className="rex-cart-layout">
            <div className="rex-cart-items">
              {items.map((item) => (
                <article className="rex-cart-item" key={item.id}>
                  <div className="rex-cart-item-image">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} />
                    ) : (
                      <ShoppingBag size={28} />
                    )}
                  </div>

                  <div className="rex-cart-item-details">
                    <span>{item.storeName}</span>
                    <h3>{item.name}</h3>
                    <strong>{money.format(item.price)}</strong>

                    <div className="rex-cart-item-actions">
                      <div className="rex-cart-quantity">
                        <button
                          type="button"
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus size={14} />
                        </button>

                        <span>{item.quantity}</span>

                        <button
                          type="button"
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <button
                        className="rex-cart-remove"
                        type="button"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>

                  <strong className="rex-cart-line-total">
                    {money.format(item.price * item.quantity)}
                  </strong>
                </article>
              ))}
            </div>

            <aside className="rex-cart-summary">
              <span className="rex-market-eyebrow">ORDER SUMMARY</span>
              <h2>Summary</h2>

              <div className="rex-cart-summary-row">
                <span>Items ({itemCount})</span>
                <strong>{money.format(subtotal)}</strong>
              </div>

              <div className="rex-cart-summary-row">
                <span>Delivery</span>
                <span>Calculated later</span>
              </div>

              <div className="rex-cart-summary-total">
                <span>Subtotal</span>
                <strong>{money.format(subtotal)}</strong>
              </div>

              <Link
                className="rex-cart-checkout"
                to="/marketplace/checkout"
              >
                Proceed to checkout
              </Link>

              <p>Delivery charges will be confirmed separately.</p>
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
